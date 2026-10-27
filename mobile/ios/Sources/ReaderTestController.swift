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

// Simulator-only: Android fixtures and readers, no real retailer or server requests.
final class ReaderTestController: UIViewController, WKNavigationDelegate {
    struct Sample {
        let source: String, page: String, file: String, reader: String
    }
    private let samples: [Sample] = [
        Sample(source: "trendyol", page: "https://www.trendyol.com/fixture-p-123456", file: "fixture-product", reader: "product-reader"),
        Sample(source: "hepsiburada", page: "https://www.hepsiburada.com/kinto-fixture-p-HBCV0000TEST", file: "fixture-hepsiburada", reader: "hepsiburada-reader"),
        Sample(source: "zara", page: "https://www.zara.com/tr/tr/kinto-fixture-p00000001.html", file: "fixture-zara", reader: "zara-reader"),
        Sample(source: "madamecoco", page: "https://www.madamecoco.com/kinto-test-nt0000000001-101/", file: "fixture-madamecoco", reader: "madamecoco-reader"),
        Sample(source: "madparfum", page: "https://www.madparfum.com/urun/kinto-test/", file: "fixture-madparfum", reader: "madparfum-reader"),
        Sample(source: "mango", page: "https://shop.mango.com/tr/tr/p/kadin/test/00000001/99/00", file: "fixture-mango", reader: "mango-reader")
    ]
    private var index = 0
    private var pricingPhase = false
    private var browser: WKWebView!
    private var pricingWeb: WKWebView!
    override func viewDidLoad() {
        super.viewDidLoad()
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        browser = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
        view.addSubview(browser)
        browser.navigationDelegate = self
        loadFixture()
    }
    private func loadFixture() {
        let sample = samples[index]
        guard let path = Bundle.main.path(forResource: sample.file, ofType: "html"),
              let html = try? String(contentsOfFile: path, encoding: .utf8) else { finish("FAIL: missing " + sample.file); return }
        let csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'\">"
        browser.loadHTMLString(csp + html, baseURL: URL(string: sample.page))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if pricingPhase && webView === pricingWeb { testPricing(webView); return }
        let sample = samples[index]
        guard let path = Bundle.main.path(forResource: sample.reader, ofType: "js"),
              let script = try? String(contentsOfFile: path, encoding: .utf8) else { finish("FAIL: missing reader " + sample.source); return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.3) { self.read(webView, sample: sample, script: script) }
    }
    private func read(_ webView: WKWebView, sample: Sample, script: String) {
        webView.evaluateJavaScript(script) { result, error in
            guard error == nil, let text = result as? String else { self.finish("FAIL: JavaScript " + sample.source); return }
            if sample.source == "mango" {
                guard CapturedProduct.validate(text, expectedURL: sample.page, currentURL: sample.page, source: sample.source) == nil else { self.finish("FAIL: missing mango size accepted"); return }
                // The Android reader records an actual selection only after its listener is installed.
                webView.evaluateJavaScript("document.getElementById('product.sizeSelector.available.22').click()") { _, clickError in
                    guard clickError == nil else { self.finish("FAIL: mango choice"); return }
                    webView.evaluateJavaScript(script) { second, secondError in
                        guard secondError == nil, let updated = second as? String else { self.finish("FAIL: mango reread"); return }
                        self.verify(updated, webView: webView, sample: sample)
                    }
                }
            } else { self.verify(text, webView: webView, sample: sample) }
        }
    }
    private func verify(_ text: String, webView: WKWebView, sample: Sample) {
        // Android's Zara flow asks the customer for an absent size; never guess one.
        if sample.source == "zara" {
            guard let data = text.data(using: .utf8),
                  let raw = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  raw["pageUrl"] as? String == sample.page,
                  (raw["price"] as? NSNumber)?.doubleValue == 1000,
                  let needs = raw["optionRequirements"] as? [String: Any], needs["size"] as? Bool == true,
                  let opts = raw["observedOptions"] as? [String: Any], opts["size"] as? String == "",
                  CapturedProduct.validate(text, expectedURL: sample.page, currentURL: webView.url?.absoluteString ?? "", source: sample.source) == nil
            else { finish("FAIL: Zara missing-size guard"); return }
            advance()
            return
        }
        guard let item = CapturedProduct.validate(text, expectedURL: sample.page, currentURL: webView.url?.absoluteString ?? "", source: sample.source),
              (item["price"] as? NSNumber)?.doubleValue == 1000,
              CapturedProduct.validate(text, expectedURL: sample.page, currentURL: sample.page + "?changed=1", source: sample.source) == nil,
              CapturedProduct.validate("{\"error\":\"NOT_PRODUCT\"}", expectedURL: sample.page, currentURL: sample.page, source: sample.source) == nil
        else { finish("FAIL: " + sample.source + " reader or validation: " + String(text.prefix(1200))); return }
        if sample.source == "hepsiburada" {
            guard let opts = item["observedOptions"] as? [String: Any], opts["size"] as? String == "L", opts["color"] as? String == "Haki" else { finish("FAIL: hepsi options"); return }
            var altered = item
            altered["observedOptions"] = ["size": "", "color": "Haki"]
            guard let d = try? JSONSerialization.data(withJSONObject: altered), let modified = String(data: d, encoding: .utf8),
                  CapturedProduct.validate(modified, expectedURL: sample.page, currentURL: sample.page, source: sample.source) == nil
            else { finish("FAIL: missing option accepted"); return }
        }
        advance()
    }
    private func advance() {
        index += 1
        if index == samples.count {
            pricingPhase = true
            let config = WKWebViewConfiguration()
            config.websiteDataStore = .nonPersistent()
            pricingWeb = WKWebView(frame: .zero, configuration: config)
            pricingWeb.navigationDelegate = self
            pricingWeb.loadHTMLString("<html><body>local pricing fixture</body></html>", baseURL: nil)
        } else { loadFixture() }
    }
    private func testPricing(_ webView: WKWebView) {
        guard let corePath = Bundle.main.path(forResource: "kinto-global-pricing-core-v1", ofType: "js"),
              let core = try? String(contentsOfFile: corePath, encoding: .utf8),
              let fixturePath = Bundle.main.path(forResource: "pricing-fixture", ofType: "json"),
              let fixture = try? String(contentsOfFile: fixturePath, encoding: .utf8),
              let parsed = try? JSONSerialization.jsonObject(with: Data(fixture.utf8)) as? [String: Any],
              parsed["schema_version"] as? Int == 1,
              parsed["enabled"] as? Bool == true,
              parsed["formula"] as? String == "usd_cross_markup_v1",
              parsed["shipping_included"] as? Bool == false
        else { finish("FAIL: synthetic pricing contract"); return }
        // The exact KINTO core runs in a local, separate WebKit view; no network.
        let script = core + """
        ;(() => {
          const c = \(fixture);
          const a = KintoGlobalPricingV1.estimate('1000', 'TRY', 1, c);
          const b = KintoGlobalPricingV1.estimate('0.01', 'TRY', 1, c);
          const usd = {...c, display_currency:'USD'};
          const d = KintoGlobalPricingV1.estimate('1', 'TRY', 1, usd);
          let rejected = false;
          try { KintoGlobalPricingV1.estimate('1000','TRY',1,{...c,enabled:false}); } catch(e) { rejected = true; }
          return a.amount === '35750' && a.currency === 'IQD' && a.shipping === null &&
                 b.amount === '1' && d.amount === '0.03' && rejected;
        })()
        """
        webView.evaluateJavaScript(script) { result, error in
            self.finish(error == nil && (result as? Bool) == true ? "PASS" : "FAIL: synthetic pricing calculation")
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
