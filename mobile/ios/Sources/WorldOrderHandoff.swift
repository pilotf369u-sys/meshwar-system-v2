import Foundation

// Preparing this value is local and never submits an order or opens a WebView.
enum WorldOrderHandoff {
    struct Draft {
        let url: String, title: String, image: String, price: String
        let size: String, color: String, requestKey: String
        let quantity: Int
        let optionsConfirmed: Bool, fixture: Bool
    }
    enum Rejection: Error { case invalidDraft }

    static func reviewURL(_ d: Draft) throws -> URL {
        guard case .retailer(let source) = KintoURLPolicy.classify(d.url),
              let parts = URLComponents(string: d.url), validProductPath(parts.path, source: source),
              !d.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              d.title.count <= 500, d.url.utf8.count <= 2048,
              (1...99).contains(d.quantity), d.optionsConfirmed, !d.fixture,
              UUID(uuidString: d.requestKey) != nil,
              d.price.range(of: "^[0-9]{1,13}(\\.[0-9]{1,8})?$", options: .regularExpression) != nil,
              let number = Decimal(string: d.price, locale: Locale(identifier: "en_US_POSIX")),
              number > 0, number <= Decimal(string: "1000000000000")!,
              d.size.count <= 100, d.color.count <= 100, validImage(d.image)
        else { throw Rejection.invalidDraft }
        let item: [String: Any] = [
            "url": d.url, "title": d.title, "image": d.image, "price": d.price,
            "quantity": d.quantity, "selectedOptions": ["size": d.size, "color": d.color],
            "optionsConfirmed": true, "fixture": false, "pricingSource": "admin-global-v1"
        ]
        let payload: [String: Any] = ["requestKey": d.requestKey, "items": [item]]
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        guard data.count <= 150000, let json = String(data: data, encoding: .utf8) else { throw Rejection.invalidDraft }
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~")
        guard let encoded = json.addingPercentEncoding(withAllowedCharacters: allowed),
              let url = URL(string: "https://shopkinto.com/dashboard.html?tab=activeOrders#draft=" + encoded)
        else { throw Rejection.invalidDraft }
        return url
    }

    private static func validProductPath(_ path: String, source: String) -> Bool {
        let pattern: String
        switch source {
        case "trendyol": pattern = ".*-p-[0-9]+(?:/.*)?$"
        case "hepsiburada": pattern = ".*-(?:p|pm)-[A-Za-z0-9]{3,40}/?$"
        case "zara": pattern = "^/tr/tr/[^/]+-p[0-9]{8}\\.html$"
        case "mango": pattern = "^/tr/tr/p/.+/[0-9]{8}/[0-9]{2}/[0-9]{2}/?$"
        case "madparfum": pattern = "(?i)^/urun/[a-z0-9-]+/$"
        case "madamecoco":
            guard path.range(of: "(?i).*-([a-z0-9]{5,30})-[0-9]{1,5}/?$", options: .regularExpression) != nil else { return false }
            let components = path.trimmingCharacters(in: CharacterSet(charactersIn: "/")).split(separator: "-")
            guard components.count >= 2 else { return false }
            let identity = String(components[components.count - 2])
            return identity.range(of: "[A-Za-z]", options: .regularExpression) != nil &&
                   identity.range(of: "[0-9]", options: .regularExpression) != nil
        default: return false
        }
        return path.range(of: pattern, options: .regularExpression) != nil
    }

    private static func validImage(_ raw: String) -> Bool {
        if raw.isEmpty { return true }
        guard raw.utf8.count <= 2048, let u = URLComponents(string: raw),
              u.scheme?.lowercased() == "https", u.user == nil, u.password == nil,
              u.port == nil || u.port == 443, let h = u.host?.lowercased() else { return false }
        if h == "media.mango.com" { return u.path.hasPrefix("/is/image/punto/") }
        if h == "ba62e8.cdn.akinoncloud.com" || h == "4d0873.akinoncloudcdn.com" { return u.path.hasPrefix("/products/") }
        if h == "static.zara.net" { return u.path.hasPrefix("/assets/") }
        return h == "productimages.hepsiburada.net" ||
               h == "dsmcdn.com" || h.hasSuffix(".dsmcdn.com") ||
               h == "trendyolcdn.com" || h.hasSuffix(".trendyolcdn.com") ||
               h == "trendyol.com" || h.hasSuffix(".trendyol.com")
    }
}
