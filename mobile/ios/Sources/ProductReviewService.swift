import Foundation
import WebKit

struct ReviewedQuote {
    let title: String, options: String, amount: String, currency: String
}

// Preview-only. No account data, JavaScript bridge, draft storage or order submission.
final class ProductReviewService: NSObject, WKNavigationDelegate, URLSessionTaskDelegate {
    private weak var retailer: WKWebView?
    private var calculator: WKWebView?
    private var session: URLSession?
    private var completion: ((Result<ReviewedQuote, Error>) -> Void)?
    private var page = "", source = "", reader = "", first = ""
    private var snapshot: [String: Any]?
    private var completed = false
    private enum Failure: Error { case unavailable }
    private let endpoint = "https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/kinto_global_pricing_read_v1"
    // Public publishable key, already present in KINTO's Android application.
    private let publicKey = "sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH"

    func review(_ web: WKWebView, completion: @escaping (Result<ReviewedQuote, Error>) -> Void) {
        self.completion = completion
        retailer = web
        guard !web.isLoading, let url = web.url?.absoluteString,
              case .retailer(let store) = KintoURLPolicy.classify(url) else { fail(); return }
        let names = ["trendyol":"product-reader", "hepsiburada":"hepsiburada-reader", "zara":"zara-reader",
                     "mango":"mango-reader", "madamecoco":"madamecoco-reader", "madparfum":"madparfum-reader"]
        guard let name = names[store], let path = Bundle.main.path(forResource: name, ofType: "js"),
              let code = try? String(contentsOfFile: path, encoding: .utf8) else { fail(); return }
        page = url; source = store; reader = code
        web.evaluateJavaScript(code) { [weak self, weak web] value, error in
            guard let self = self, let web = web, error == nil, let text = value as? String,
                  !web.isLoading,
                  CapturedProduct.validate(text, expectedURL: self.page, currentURL: web.url?.absoluteString ?? "", source: self.source) != nil
            else { self?.fail(); return }
            self.first = text
            self.loadPricing()
        }
    }

    private func loadPricing() {
        guard let url = URL(string: endpoint) else { fail(); return }
        let cfg = URLSessionConfiguration.ephemeral
        cfg.httpShouldSetCookies = false
        cfg.urlCache = nil
        cfg.timeoutIntervalForRequest = 10
        cfg.timeoutIntervalForResource = 15
        let session = URLSession(configuration: cfg, delegate: self, delegateQueue: nil)
        self.session = session
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.httpBody = Data("{}".utf8)
        req.setValue(publicKey, forHTTPHeaderField: "apikey")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        session.dataTask(with: req) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self, error == nil, let http = response as? HTTPURLResponse, http.statusCode == 200,
                      let data = data, data.count <= 65536,
                      let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      doc["schema_version"] as? Int == 1,
                      doc["enabled"] as? Bool == true,
                      doc["formula"] as? String == "usd_cross_markup_v1",
                      doc["shipping_included"] as? Bool == false,
                      let revision = doc["revision"] as? Int, revision >= 0 else { self?.fail(); return }
                self.snapshot = doc
                self.recheck()
            }
        }.resume()
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }

    private func recheck() {
        guard let web = retailer, !web.isLoading, web.url?.absoluteString == page else { fail(); return }
        web.evaluateJavaScript(reader) { [weak self, weak web] value, error in
            guard let self = self, let web = web, !web.isLoading, error == nil, let text = value as? String,
                  let current = CapturedProduct.validate(text, expectedURL: self.page, currentURL: web.url?.absoluteString ?? "", source: self.source),
                  let initial = CapturedProduct.validate(self.first, expectedURL: self.page, currentURL: self.page, source: self.source),
                  let currentPrice = current["price"] as? NSNumber, let initialPrice = initial["price"] as? NSNumber,
                  currentPrice == initialPrice,
                  let currentOptions = current["observedOptions"] as? NSDictionary,
                  let initialOptions = initial["observedOptions"] as? NSDictionary, currentOptions == initialOptions,
                  let currentTitle = current["title"] as? String, currentTitle == initial["title"] as? String
            else { self?.fail(); return }
            self.first = text
            self.prepareCalculator()
        }
    }

    private func prepareCalculator() {
        guard snapshot != nil else { fail(); return }
        let cfg = WKWebViewConfiguration()
        cfg.websiteDataStore = .nonPersistent()
        let view = WKWebView(frame: .zero, configuration: cfg)
        calculator = view
        view.navigationDelegate = self
        view.loadHTMLString("<html><body></body></html>", baseURL: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard webView === calculator, let doc = snapshot,
              let item = CapturedProduct.validate(first, expectedURL: page, currentURL: retailer?.url?.absoluteString ?? "", source: source),
              let price = item["price"] as? NSNumber,
              let path = Bundle.main.path(forResource: "kinto-global-pricing-core-v1", ofType: "js"),
              let core = try? String(contentsOfFile: path, encoding: .utf8),
              let payload = try? JSONSerialization.data(withJSONObject: ["config": doc, "price": price.stringValue])
        else { fail(); return }
        let input = payload.base64EncodedString()
        let script = core + """
        ;(() => {
          const p = JSON.parse(atob('\(input)'));
          const out = KintoGlobalPricingV1.estimate(p.price, 'TRY', 1, p.config);
          return JSON.stringify(out);
        })()
        """
        webView.evaluateJavaScript(script) { [weak self] value, error in
            guard let self = self, error == nil, let raw = value as? String, raw.utf8.count < 4096,
                  let data = raw.data(using: .utf8),
                  let out = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let amount = out["amount"] as? String, amount.range(of: "^[0-9]{1,20}(\\.[0-9]{2})?$", options: .regularExpression) != nil,
                  let currency = out["currency"] as? String, currency == doc["display_currency"] as? String,
                  out["shipping"] is NSNull,
                  let web = self.retailer, !web.isLoading, web.url?.absoluteString == self.page,
                  let title = item["title"] as? String,
                  let options = item["observedOptions"] as? [String: Any]
            else { self?.fail(); return }
            let values = ["size", "color"].compactMap { options[$0] as? String }.filter { !$0.isEmpty }
            self.finish(.success(ReviewedQuote(title: title, options: values.joined(separator: " • "), amount: amount, currency: currency)))
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { fail() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { fail() }
    private func fail() { finish(.failure(Failure.unavailable)) }
    private func finish(_ result: Result<ReviewedQuote, Error>) {
        guard !completed else { return }
        completed = true
        session?.invalidateAndCancel()
        session = nil
        calculator?.stopLoading()
        calculator = nil
        let callback = completion
        completion = nil
        callback?(result)
    }
}
