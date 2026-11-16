import Foundation

let key = "12345678-1234-4234-8234-123456789abc"
func draft(_ url: String = "https://www.trendyol.com/test-p-123456", quantity: Int = 1, fixture: Bool = false, confirmed: Bool = true, image: String = "https://cdn.dsmcdn.com/test.jpg", price: String = "1000", requestKey: String = key) -> WorldOrderHandoff.Draft {
    .init(url: url, title: "منتج اختبار", image: image, price: price, size: "L", color: "Haki", requestKey: requestKey, quantity: quantity, optionsConfirmed: confirmed, fixture: fixture)
}
let url = try WorldOrderHandoff.reviewURL(draft())
let c = URLComponents(url: url, resolvingAgainstBaseURL: false)!
precondition(c.host == "shopkinto.com" && c.path == "/dashboard.html" && c.query == "tab=activeOrders")
let fragment = c.fragment!
precondition(fragment.hasPrefix("draft="))
let raw = String(fragment.dropFirst(6))
let obj = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as! [String: Any]
precondition(obj["requestKey"] as? String == key)
let items = obj["items"] as! [[String: Any]]
precondition(items.count == 1 && items[0]["price"] as? String == "1000" && items[0]["optionsConfirmed"] as? Bool == true)
for x in [draft("https://trendyol.com.evil.test/test-p-123456"), draft("https://www.trendyol.com/"),
          draft(quantity: 0), draft(quantity: 100), draft(fixture: true), draft(confirmed: false),
          draft(image: "https://cdn.dsmcdn.com.evil.test/image.jpg"), draft(price: "0"),
          draft(price: "NaN"), draft(requestKey: "invalid")] {
    do { _ = try WorldOrderHandoff.reviewURL(x); fatalError("Invalid draft accepted") } catch {}
}
print("World order one-product handoff checks passed")
