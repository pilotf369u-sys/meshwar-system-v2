import UIKit
import WebKit

// Preview-only: validates untrusted reader output before any future handoff.
enum CapturedProduct {
    static func validate(_ text: String, expectedURL: String, currentURL: String, source: String) -> [String: Any]? {
        guard text.utf8.count <= 32768, expectedURL == currentURL,
              case .retailer(let actualSource) = KintoURLPolicy.classify(expectedURL),
              actualSource == source,
              let data = text.data(using: .utf8),
              let item = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              item["error"] == nil,
              item["pageUrl"] as? String == expectedURL,
              item["source"] as? String == source,
              item["currency"] as? String == "TRY",
              let title = item["title"] as? String, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, title.count <= 500,
              let price = item["price"] as? NSNumber, CFGetTypeID(price) != CFBooleanGetTypeID(),
              price.doubleValue.isFinite, price.doubleValue > 0,
              (item["warning"] as? String ?? "").isEmpty,
              (item["optionsPending"] as? Bool ?? false) == false
        else { return nil }
        guard let requirements = item["optionRequirements"] as? [String: Any],
              let options = item["observedOptions"] as? [String: Any] else { return nil }
        for key in ["size", "color"] where requirements[key] as? Bool == true {
            guard let value = options[key] as? String, !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return nil }
        }
        return item
    }
}

// Simulator-only test: no order, account, live retailer or server writes.
final class ReaderTestController: UIViewController, WKNavigationDelegate {
    private var browser: WKWebView!
    private var page = "https://www.trendyol.com/fixture-p-123456"
    private var stage = 0
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        browser = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        view.addSubview(browser)
        browser.navigationDelegate = self
        let html = """
        <!doctype html><html><head><title>Test</title>
        <script type="application/ld+json">{"@type":"Product","name":"KINTO TEST shirt","productID":"123456","offers":{"@type":"Offer","price":"1000","priceCurrency":"TRY","url":"https://www.trendyol.com/fixture-p-123456"}}</script>
        </head><body><h1>KINTO TEST</h1></body></html>
        """
        browser.loadHTMLString(html, baseURL: URL(string: page))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let source = stage == 0 ? "trendyol" : "hepsiburada"
        let resource = stage == 0 ? "product-reader" : "hepsiburada-reader"
        guard let path = Bundle.main.path(forResource: resource, ofType: "js"),
              let script = try? String(contentsOfFile: path, encoding: .utf8) else { finish("FAIL: missing reader"); return }
        webView.evaluateJavaScript(script) { result, error in
            guard error == nil, let text = result as? String,
                  let item = CapturedProduct.validate(text, expectedURL: self.page, currentURL: webView.url?.absoluteString ?? "", source: source),
                  (item["price"] as? NSNumber)?.doubleValue == 1000,
                  CapturedProduct.validate(text, expectedURL: self.page, currentURL: self.page + "?changed=1", source: source) == nil,
                  CapturedProduct.validate(text, expectedURL: self.page, currentURL: self.page, source: "zara") == nil,
                  CapturedProduct.validate("{\"error\":\"NOT_PRODUCT\"}", expectedURL: self.page, currentURL: self.page, source: source) == nil
            else { self.finish("FAIL: reader or validation"); return }
            if self.stage == 0 {
                self.stage = 1
                self.page = "https://www.hepsiburada.com/kinto-fixture-p-HBCV0000TEST"
                guard let path = Bundle.main.path(forResource: "fixture-hepsiburada", ofType: "html"),
                      let html = try? String(contentsOfFile: path, encoding: .utf8) else { self.finish("FAIL: fixture missing"); return }
                let csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">"
                self.browser.loadHTMLString(csp + html, baseURL: URL(string: self.page))
            } else {
                guard let opts = item["observedOptions"] as? [String: Any],
                      opts["size"] as? String == "L", opts["color"] as? String == "Haki" else { self.finish("FAIL: hepsi options"); return }
                var altered = item
                altered["observedOptions"] = ["size": "", "color": "Haki"]
                guard let d = try? JSONSerialization.data(withJSONObject: altered), let modified = String(data: d, encoding: .utf8),
                      CapturedProduct.validate(modified, expectedURL: self.page, currentURL: self.page, source: source) == nil
                else { self.finish("FAIL: missing option accepted"); return }
                self.finish("PASS")
            }
        }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish("FAIL: navigation") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish("FAIL: provisional navigation") }
    private func finish(_ result: String) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? result.write(to: directory.appendingPathComponent("reader-result.txt"), atomically: true, encoding: .utf8)
    }
}
