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
