import Foundation

// Preliminary URL classification only. Integrate only after device security review.
enum KintoURLPolicy {
    enum Destination: Equatable { case account, retailer(String), blocked }

    static func canOpenRetailer(scheme: String, host: String, port: Int,
                                mainFrame: Bool, activated: Bool, destination: String) -> Bool {
        guard mainFrame, activated, scheme.lowercased() == "https",
              host.lowercased() == "shopkinto.com", port == 0 || port == 443 else { return false }
        if case .retailer = classify(destination) { return true }
        return false
    }

    static func classify(_ raw: String) -> Destination {
        guard let url = URLComponents(string: raw),
              url.scheme?.lowercased() == "https",
              url.user == nil, url.password == nil,
              url.port == nil || url.port == 443,
              let host = url.host?.lowercased(), !host.hasSuffix(".")
        else { return .blocked }
        if host == "shopkinto.com" { return .account }
        if host == "trendyol.com" || host.hasSuffix(".trendyol.com") { return .retailer("trendyol") }
        if ["hepsiburada.com", "www.hepsiburada.com", "m.hepsiburada.com"].contains(host) { return .retailer("hepsiburada") }
        if ["zara.com", "www.zara.com"].contains(host) { return .retailer("zara") }
        if host == "shop.mango.com" { return .retailer("mango") }
        if ["madparfum.com", "www.madparfum.com"].contains(host) { return .retailer("madparfum") }
        if ["madamecoco.com", "www.madamecoco.com"].contains(host) { return .retailer("madamecoco") }
        return .blocked
    }
}
