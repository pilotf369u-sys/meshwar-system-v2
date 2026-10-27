import UIKit
import WebKit

// Simulator-only test using synthetic data and a non-routable origin.
final class IsolationTestController: UIViewController, WKNavigationDelegate {
    private var trusted: WKWebView!
    private var external: WKWebView!
    private let origin = URL(string: "https://kinto-isolation.invalid/")!
    private var phase = 0

    override func viewDidLoad() {
        super.viewDidLoad()
        let a = WKWebViewConfiguration()
        a.websiteDataStore = .default()
        let b = WKWebViewConfiguration()
        b.websiteDataStore = .nonPersistent()
        trusted = WKWebView(frame: .zero, configuration: a)
        external = WKWebView(frame: .zero, configuration: b)
        trusted.navigationDelegate = self
        external.navigationDelegate = self
        trusted.loadHTMLString("<html><body>synthetic trusted fixture</body></html>", baseURL: origin)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if webView === trusted && phase == 0 {
            phase = 1
            trusted.evaluateJavaScript("localStorage.setItem('kinto_isolation_marker','account'); document.cookie='kinto_isolation_marker=account; path=/; Secure'; JSON.stringify({storage:localStorage.getItem('kinto_isolation_marker'), cookie:document.cookie})") { result, error in
                guard error == nil, let text = result as? String,
                      text.contains("account"), text.contains("kinto_isolation_marker=account") else {
                    self.finish("FAIL: unable to seed trusted fixture"); return
                }
                self.external.loadHTMLString("<html><body>synthetic external fixture</body></html>", baseURL: self.origin)
            }
        } else if webView === external && phase == 1 {
            phase = 2
            external.evaluateJavaScript("JSON.stringify({storage:localStorage.getItem('kinto_isolation_marker'), cookie:document.cookie})") { result, error in
                guard error == nil, let text = result as? String, let data = text.data(using: .utf8),
                      let values = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                      values["storage"] is NSNull, let cookie = values["cookie"] as? String,
                      !cookie.contains("kinto_isolation_marker") else {
                    self.finish("FAIL: retailer saw trusted data or fixture did not load"); return
                }
                self.finish("PASS")
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish("FAIL: navigation") }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish("FAIL: provisional navigation") }

    private func finish(_ result: String) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? result.write(to: directory.appendingPathComponent("isolation-result.txt"), atomically: true, encoding: .utf8)
    }
}
