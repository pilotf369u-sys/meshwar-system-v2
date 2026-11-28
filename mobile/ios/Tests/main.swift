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

precondition(KintoURLPolicy.isDirectWhatsApp("https://wa.me/9647701234567?text=hello"))
precondition(KintoURLPolicy.isDirectWhatsApp("https://wa.me/905551234567/"))
precondition(!KintoURLPolicy.isDirectWhatsApp("http://wa.me/9647701234567"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me.evil.test/9647701234567"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me@evil.test/9647701234567"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me:444/9647701234567"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me/12345"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me/000000000"))
precondition(!KintoURLPolicy.isDirectWhatsApp("https://wa.me/9647701234567#fragment"))
print("Direct WhatsApp destination checks passed")

func support(_ scheme: String = "https", _ host: String = "shopkinto.com", _ port: Int = 443,
             _ main: Bool = true, _ popup: Bool = true, _ dest: String = "https://wa.me/9647701234567",
             _ tap: String? = "https://shopkinto.com/global-stores.html",
             _ page: String? = "https://shopkinto.com/global-stores.html", _ age: TimeInterval = 0.2) -> Bool {
    KintoURLPolicy.canOpenSupportPopup(scheme: scheme, host: host, port: port, mainFrame: main,
        popup: popup, destination: dest, tapPage: tap, currentPage: page, age: age)
}
precondition(support())
precondition(!support("http"))
precondition(!support("https", "shopkinto.com.evil.test"))
precondition(!support("https", "shopkinto.com", 444))
precondition(!support("https", "shopkinto.com", 443, false))
precondition(!support("https", "shopkinto.com", 443, true, false))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me.evil.test/9647701234567"))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me/123"))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me/9647701234567", nil))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me/9647701234567", "https://shopkinto.com/a", "https://shopkinto.com/b"))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me/9647701234567", "https://shopkinto.com/a", "https://shopkinto.com/a", 1.5))
precondition(!support("https", "shopkinto.com", 443, true, true, "https://wa.me/9647701234567", "https://shopkinto.com/a", "https://shopkinto.com/a", -1))
print("Support popup policy checks passed")
