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
    private var invoiceTestState = "initial"
    private var productReview: ProductReviewService?
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
            navigationItem.rightBarButtonItem = UIBarButtonItem(title: "مراجعة المنتج", style: .plain, target: self, action: #selector(reviewProduct))
            browser.load(URLRequest(url: url))
        }
    }

    private func openRetailer(_ url: URL) {
        guard presentedViewController == nil else { return }
        let panel = UINavigationController(rootViewController: BrowserController(mode: .retailer(url)))
        present(panel, animated: true)
    }

    private func openExternal(_ url: URL) {
        guard presentedViewController == nil else { return }
        let alert = UIAlertController(title: "فتح رابط خارج KINTO", message: "سيُفتح الرابط في التطبيق أو المتصفح المناسب.", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "إلغاء", style: .cancel))
        alert.addAction(UIAlertAction(title: "فتح", style: .default) { [weak self] _ in
            UIApplication.shared.open(url, options: [:]) { [weak self] opened in
                guard !opened, let self = self else { return }
                let failure = UIAlertController(title: "تعذر فتح الرابط", message: "لا يوجد تطبيق متاح لفتح هذا الرابط.", preferredStyle: .alert)
                failure.addAction(UIAlertAction(title: "حسنًا", style: .cancel))
                self.present(failure, animated: true)
            }
        })
        present(alert, animated: true)
    }

    @objc private func close() { productReview = nil; dismiss(animated: true) }

    @objc private func reviewProduct() {
        guard productReview == nil else { return }
        navigationItem.rightBarButtonItem?.isEnabled = false
        let task = ProductReviewService()
        productReview = task
        task.review(browser) { [weak self] result in
            guard let self = self else { return }
            self.productReview = nil
            self.navigationItem.rightBarButtonItem?.isEnabled = true
            let message: String
            switch result {
            case .success(let quote):
                message = quote.title + "\n" + quote.options + "\nالسعر: " + quote.amount + " " + quote.currency + "\nالشحن يحدده الموظف بعد المراجعة.\nلا يُطلب المنتج إلا بعد الدفع وحسب توفره.\nإرسال الطلب غير متاح في هذه النسخة الأولية."
            case .failure:
                message = "تعذر التحقق من المنتج أو سعره. اختر منتجًا وخياراته وأعد المحاولة."
            }
            let alert = UIAlertController(title: "مراجعة المنتج", message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "حسنًا", style: .cancel))
            self.present(alert, animated: true)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url ?? (action.targetFrame == nil ? URL(string: "about:blank") : nil) else { decisionHandler(.cancel); return }
        // Child frames follow WebKit origin rules; no native script handler is installed.
        if let frame = action.targetFrame, !frame.isMainFrame { decisionHandler(.allow); return }
        let destination = KintoURLPolicy.classify(url.absoluteString)
        if action.targetFrame == nil {
            switch mode {
            case .account, .invoiceFixture:
                let origin = action.sourceFrame.securityOrigin
                if case .invoiceFixture = mode { invoiceTestState = "action: " + origin.protocol + "://" + origin.host + ":" + String(origin.port) + " " + url.absoluteString }
                let trusted = action.sourceFrame.isMainFrame && origin.protocol.lowercased() == "https" &&
                    origin.host.lowercased() == "shopkinto.com" && (origin.port == 0 || origin.port == 443)
                let isBlank = url.absoluteString.isEmpty || url.absoluteString == "about:blank"
                if KintoURLPolicy.canOpenRetailer(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                   mainFrame: action.sourceFrame.isMainFrame,
                                                   activated: action.navigationType == .linkActivated,
                                                   destination: url.absoluteString) {
                    decisionHandler(.cancel)
                    openRetailer(url)
                    return
                }
                if KintoURLPolicy.canOpenExternal(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                  mainFrame: action.sourceFrame.isMainFrame,
                                                  activated: action.navigationType == .linkActivated,
                                                  destination: url.absoluteString) {
                    decisionHandler(.cancel)
                    openExternal(url)
                    return
                }
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
                let origin = action.sourceFrame.securityOrigin
                guard KintoURLPolicy.canOpenRetailer(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                    mainFrame: action.sourceFrame.isMainFrame,
                                                    activated: action.navigationType == .linkActivated,
                                                    destination: url.absoluteString) else { return }
                openRetailer(url)
            case .blocked:
                decisionHandler(.cancel)
                let origin = action.sourceFrame.securityOrigin
                if KintoURLPolicy.canOpenExternal(scheme: origin.protocol, host: origin.host, port: origin.port,
                                                   mainFrame: action.sourceFrame.isMainFrame,
                                                   activated: action.navigationType == .linkActivated,
                                                   destination: url.absoluteString) { openExternal(url) }
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
        if let url = navigationAction.request.url,
           KintoURLPolicy.canOpenRetailer(scheme: origin.protocol, host: origin.host, port: origin.port,
                                           mainFrame: navigationAction.sourceFrame.isMainFrame,
                                           activated: navigationAction.navigationType == .linkActivated,
                                           destination: url.absoluteString) {
            openRetailer(url)
            return nil
        }
        if let url = navigationAction.request.url,
           KintoURLPolicy.canOpenExternal(scheme: origin.protocol, host: origin.host, port: origin.port,
                                          mainFrame: navigationAction.sourceFrame.isMainFrame,
                                          activated: navigationAction.navigationType == .linkActivated,
                                          destination: url.absoluteString) {
            openExternal(url)
            return nil
        }
        if case .invoiceFixture = mode { invoiceTestState = "popup: " + origin.protocol + "://" + origin.host + ":" + String(origin.port) + " main=" + String(navigationAction.sourceFrame.isMainFrame) + " modal=" + String(presentedViewController != nil) + " url=" + (navigationAction.request.url?.absoluteString ?? "<nil>") }
        guard webView === browser, presentedViewController == nil, navigationAction.sourceFrame.isMainFrame,
              origin.protocol.lowercased() == "https", origin.host.lowercased() == "shopkinto.com",
              origin.port == 0 || origin.port == 443 else { return nil }
        let address = navigationAction.request.url?.absoluteString ?? "about:blank"
        guard address.isEmpty || address == "about:blank" || KintoURLPolicy.classify(address) == .account else { return nil }
        let document = InvoiceDocumentController(configuration: configuration)
        let nav = UINavigationController(rootViewController: document)
        present(nav, animated: true)
        if case .invoiceFixture = mode {
            DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
                document.web.evaluateJavaScript("Boolean(document.body && document.body.innerText.includes('KINTO SYNTHETIC INVOICE') && document.getElementById('kinto-app-invoice-layout'))") { result, error in
                    self.recordInvoiceTest(error == nil && (result as? Bool) == true)
                }
            }
        }
        return document.web
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        if case .invoiceFixture = mode {
            invoiceTestState = "fixture loaded"
            DispatchQueue.main.asyncAfter(deadline: .now() + 15) { self.recordInvoiceTimeout() }
            webView.evaluateJavaScript("const p=window.open('', '_blank'); if(p){p.document.open();p.document.write('<html><head></head><body><div class=invoice><div class=invoice-head>KINTO SYNTHETIC INVOICE</div></div></body></html>');p.document.close();}")
        }
    }

    private func recordInvoiceTimeout() {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let path = directory.appendingPathComponent("invoice-result.txt")
        if !FileManager.default.fileExists(atPath: path.path) {
            try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            try? ("FAIL: " + invoiceTestState).write(to: path, atomically: true, encoding: .utf8)
        }
    }

    private func recordInvoiceTest(_ ok: Bool) {
        let directory = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? (ok ? "PASS" : "FAIL: popup content").write(to: directory.appendingPathComponent("invoice-result.txt"), atomically: true, encoding: .utf8)
    }
}
