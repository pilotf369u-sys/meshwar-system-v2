import Foundation

let cases: [(String, KintoURLPolicy.Destination)] = [
    ("https://shopkinto.com/dashboard.html", .account),
    ("https://shopkinto.com:443/", .account),
    ("http://shopkinto.com/", .blocked),
    ("https://shopkinto.com.evil.example/", .blocked),
    ("https://shopkinto.com@evil.example/", .blocked),
    ("https://shopkinto.com:444/", .blocked),
    ("https://www.trendyol.com/", .retailer("trendyol")),
    ("https://trendyol.com.evil.example/", .blocked),
    ("https://eviltrendyol.com/", .blocked),
    ("https://www.hepsiburada.com/", .retailer("hepsiburada")),
    ("https://www.zara.com/", .retailer("zara")),
    ("https://shop.mango.com/", .retailer("mango")),
    ("https://www.madparfum.com/", .retailer("madparfum")),
    ("https://www.madamecoco.com/", .retailer("madamecoco")),
    ("file:///private/data", .blocked),
    ("javascript:alert(1)", .blocked),
    ("https://user:pass@shopkinto.com/", .blocked)
]
for (url, expected) in cases {
    precondition(KintoURLPolicy.classify(url) == expected, "Unexpected classification: \(url)")
}
print("URL policy checks passed: \(cases.count)")

func retail(_ scheme: String, _ host: String, _ port: Int, _ main: Bool, _ tap: Bool, _ dest: String) -> Bool {
    KintoURLPolicy.canOpenRetailer(scheme: scheme, host: host, port: port, mainFrame: main, activated: tap, destination: dest)
}
let store = "https://www.trendyol.com/"
precondition(retail("https", "shopkinto.com", 443, true, true, store))
precondition(retail("https", "shopkinto.com", 0, true, true, store))
precondition(!retail("http", "shopkinto.com", 443, true, true, store))
precondition(!retail("https", "shopkinto.com.evil.test", 443, true, true, store))
precondition(!retail("https", "shopkinto.com", 444, true, true, store))
precondition(!retail("https", "shopkinto.com", 443, false, true, store))
precondition(!retail("https", "shopkinto.com", 443, true, false, store))
precondition(!retail("https", "shopkinto.com", 443, true, true, "https://trendyol.com.evil.test/"))
precondition(!retail("https", "shopkinto.com", 443, true, true, "https://shopkinto.com/"))
print("Retailer handoff security checks passed")

func external(_ origin: String, _ main: Bool, _ tap: Bool, _ target: String) -> Bool {
    KintoURLPolicy.canOpenExternal(scheme: "https", host: origin, port: 443, mainFrame: main, activated: tap, destination: target)
}
precondition(external("shopkinto.com", true, true, "https://wa.me/12345"))
precondition(external("shopkinto.com", true, true, "mailto:support@shopkinto.com"))
precondition(external("shopkinto.com", true, true, "tel:+96412345"))
precondition(external("shopkinto.com", true, true, "whatsapp://send?phone=12345"))
precondition(external("shopkinto.com", true, true, "https://unsupported-store.example/"))
precondition(!external("shopkinto.com", false, true, "https://wa.me/12345"))
precondition(!external("shopkinto.com", true, false, "https://wa.me/12345"))
precondition(!external("shopkinto.com.evil.test", true, true, "https://wa.me/12345"))
precondition(!external("shopkinto.com", true, true, "javascript:alert(1)"))
precondition(!external("shopkinto.com", true, true, "file:///etc/passwd"))
precondition(!external("shopkinto.com", true, true, "https://user:pass@evil.example/"))
precondition(!external("shopkinto.com", true, true, "https://example.com:444/"))
precondition(!external("shopkinto.com", true, true, "https://shopkinto.com/"))
precondition(!external("shopkinto.com", true, true, "https://www.trendyol.com/"))
print("External link security checks passed")
