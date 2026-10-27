import UIKit
import WebKit

// Early simulator-only foundation. Retailer product capture and order handoff are
// intentionally unavailable until each store and the cross-origin boundary are tested.
@main
final class KintoAppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let window = UIWindow(frame: UIScreen.main.bounds)
        if ProcessInfo.processInfo.arguments.contains("--isolation-test") {
            window.rootViewController = IsolationTestController()
        } else if ProcessInfo.processInfo.arguments.contains("--invoice-test") {
            window.rootViewController = UINavigationController(rootViewController: BrowserController(mode: .invoiceFixture))
        } else if ProcessInfo.processInfo.arguments.contains("--reader-test") {
            window.rootViewController = ReaderTestController()
        } else {
            window.rootViewController = UINavigationController(rootViewController: BrowserController(mode: .account))
        }
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    enum Mode { case account, retailer(URL), invoiceFixture }
    private let mode: Mode
    private var browser: WKWebView!
    private var store: WKWebsiteDataStore?
    init(mode: Mode) { self.mode = mode; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "KINTO — نسخة أولية"
        view.backgroundColor = .systemBackground
        let config = WKWebViewConfiguration()
        switch mode {
        case .account, .invoiceFixture:
            config.websiteDataStore = .default()
            config.preferences.javaScriptCanOpenWindowsAutomatically = true
        case .retailer:
            let isolated = WKWebsiteDataStore.nonPersistent()
            store = isolated
            config.websiteDataStore = isolated
        }
        browser = WKWebView(frame: .zero, configuration: config)
        browser.navigationDelegate = self
        browser.uiDelegate = self
        browser.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(browser)
        NSLayoutConstraint.activate([
            browser.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            browser.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            browser.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
        switch mode {
        case .account:
            guard let home = URL(string: "https://shopkinto.com/") else { return }
            browser.load(URLRequest(url: home))
        case .invoiceFixture:
            let html = "<html><body>INVOICE FIXTURE</body></html>"
            browser.loadHTMLString(html, baseURL: URL(string: "https://shopkinto.com/__invoice_fixture"))
        case .retailer(let url):
            navigationItem.leftBarButtonItem = UIBarButtonItem(title: "العودة إلى KINTO", style: .plain, target: self, action: #selector(close))
            browser.load(URLRequest(url: url))
        }
    }

    @objc private func close() { dismiss(animated: true) }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        // Child frames follow WebKit origin rules; no native script handler is installed.
        if let frame = action.targetFrame, !frame.isMainFrame { decisionHandler(.allow); return }
        let destination = KintoURLPolicy.classify(url.absoluteString)
        if action.targetFrame == nil {
            switch mode {
            case .account, .invoiceFixture:
                let origin = action.sourceFrame.securityOrigin
                let trusted = action.sourceFrame.isMainFrame && origin.protocol.lowercased() == "https" &&
                    origin.host.lowercased() == "shopkinto.com" && (origin.port == 0 || origin.port == 443)
                let isBlank = url.absoluteString == "about:blank"
                if trusted && (isBlank || destination == .account) { decisionHandler(.allow); return }
            case .retailer: break
            }
            decisionHandler(.cancel)
            return
        }
        switch mode {
        case .account, .invoiceFixture:
            switch destination {
            case .account:
                if action.targetFrame == nil { decisionHandler(.cancel); return }
                decisionHandler(.allow)
            case .retailer:
                decisionHandler(.cancel)
                guard action.navigationType == .linkActivated else { return }
                let panel = UINavigationController(rootViewController: BrowserController(mode: .retailer(url)))
                present(panel, animated: true)
            case .blocked: decisionHandler(.cancel)
            }
        case .retailer:
            if case .retailer = destination, action.targetFrame != nil {
                decisionHandler(.allow)
            } else { decisionHandler(.cancel) }
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        switch mode {
        case .retailer: return nil
        case .account, .invoiceFixture: break
        }
        let origin = navigationAction.sourceFrame.securityOrigin
        guard webView === browser, presentedViewController == nil, navigationAction.sourceFrame.isMainFrame,
              origin.protocol.lowercased() == "https", origin.host.lowercased() == "shopkinto.com",
              origin.port == 0 || origin.port == 443 else { return nil }
        let address = navigationAction.request.url?.absoluteString ?? ""
        guard address == "about:blank" || KintoURLPolicy.classify(address) == .account else { return nil }
        let document = InvoiceDocumentController(configuration: configuration)
        let nav = UINavigationController(rootViewController: document)
        present(nav, animated: true)
        if case .invoiceFixture = mode {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                document.web.evaluateJavaScript("document.body && document.body.innerText") { result, error in
                    self.recordInvoiceTest(error == nil && (result as? String)?.contains("KINTO SYNTHETIC INVOICE") == true)
                }
            }
        }
        return document.web
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .invoiceFixture = mode {
            webView.evaluateJavaScript("const p=window.open('', '_blank'); if(p){p.document.open();p.document.write('<html><body>KINTO SYNTHETIC INVOICE</body></html>');p.document.close();}")
        }
    }

    private func recordInvoiceTest(_ ok: Bool) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? (ok ? "PASS" : "FAIL: popup content").write(to: directory.appendingPathComponent("invoice-result.txt"), atomically: true, encoding: .utf8)
    }
}
