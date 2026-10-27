import Foundation

// Preliminary URL classification only. Integrate only after device security review.
enum KintoURLPolicy {
    enum Destination: Equatable { case account, retailer(String), blocked }

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
