import UIKit
import WebKit

// A child of the trusted KINTO account view. External sites never get this view.
final class InvoiceDocumentController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    let web: WKWebView
    init(configuration: WKWebViewConfiguration) {
        web = WKWebView(frame: .zero, configuration: configuration)
        super.init(nibName: nil, bundle: nil)
        web.navigationDelegate = self
        web.uiDelegate = self
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) unsupported") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "KINTO"
        view.backgroundColor = .systemBackground
        navigationItem.leftBarButtonItem = UIBarButtonItem(title: "إغلاق", style: .plain, target: self, action: #selector(close))
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "طباعة", style: .plain, target: self, action: #selector(printDocument))
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        applyMobileInvoiceStyle(attempts: 120)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            web.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])
    }
    // Reuses Android's screen-only CSS, without its print/video code or network reads.
    private func applyMobileInvoiceStyle(attempts: Int) {
        guard attempts > 0,
              let path = Bundle.main.path(forResource: "invoice-mobile", ofType: "css"),
              let css = try? String(contentsOfFile: path, encoding: .utf8),
              let data = try? JSONSerialization.data(withJSONObject: [css]),
              let encoded = String(data: data, encoding: .utf8) else { return }
        let script = """
        (() => {
          if (location.href !== 'about:blank' && location.origin !== 'https://shopkinto.com') return false;
          if (!document.querySelector('.invoice .invoice-head') || !document.head) return false;
          if (document.getElementById('kinto-app-invoice-layout')) return true;
          let viewport = document.querySelector('meta[name="viewport"]');
          if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.append(viewport); }
          viewport.content = 'width=device-width,initial-scale=1';
          const style = document.createElement('style');
          style.id = 'kinto-app-invoice-layout';
          style.textContent = (\(encoded))[0];
          document.head.append(style);
          return true;
        })()
        """
        web.evaluateJavaScript(script) { [weak self] result, _ in
            guard let self = self, (result as? Bool) != true, self.presentingViewController != nil else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.applyMobileInvoiceStyle(attempts: attempts - 1) }
        }
    }
    @objc private func close() { web.stopLoading(); dismiss(animated: true) }
    @objc private func printDocument() {
        guard UIPrintInteractionController.isPrintingAvailable else { return }
        let printer = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = "KINTO"
        info.outputType = .general
        printer.printInfo = info
        printer.printFormatter = web.viewPrintFormatter()
        if let button = navigationItem.rightBarButtonItem {
            printer.present(from: button, animated: true)
        } else { printer.present(animated: true) }
    }
    func webViewDidClose(_ webView: WKWebView) { close() }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if let frame = action.targetFrame, !frame.isMainFrame { decisionHandler(.allow); return }
        if action.targetFrame != nil && (url.absoluteString == "about:blank" || KintoURLPolicy.classify(url.absoluteString) == .account) {
            decisionHandler(.allow)
        } else { decisionHandler(.cancel) }
    }
}
