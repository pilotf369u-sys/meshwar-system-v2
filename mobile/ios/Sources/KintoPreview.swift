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
        window.rootViewController = ProcessInfo.processInfo.arguments.contains("--isolation-test")
            ? IsolationTestController()
            : UINavigationController(rootViewController: BrowserController(mode: .account))
        window.makeKeyAndVisible()
        self.window = window
        return true
    }
}

final class BrowserController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    enum Mode { case account, retailer(URL) }
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
        case .account: config.websiteDataStore = .default()
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
        switch mode {
        case .account:
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
        // Popups/invoices are not yet implemented. No cross-origin popup is opened.
        return nil
    }
}
