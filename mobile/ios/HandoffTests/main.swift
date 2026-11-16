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

let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("kinto-handoff-" + UUID().uuidString)
defer { try? FileManager.default.removeItem(at: tmp) }
let location = tmp.appendingPathComponent("pending.json")
let first = PendingWorldOrder(path: location)
let firstURL = try first.prepare(draft(), accountID: "customer_42")
let reopened = PendingWorldOrder(path: location)
precondition(try reopened.pending(accountID: "customer_42")?.requestKey == key)
precondition(try reopened.prepare(draft(), accountID: "customer_42") == firstURL)
do { _ = try reopened.prepare(draft(requestKey: "abcdefab-1234-4234-8234-123456789abc"), accountID: "customer_42"); fatalError("Replaced pending order") } catch {}
do { _ = try reopened.pending(accountID: "customer_other"); fatalError("Cross-account data leak") } catch {}
let receipt = "kinto-app://world-submitted?requestKey=" + key
for (from, main, active, url) in [
  ("https://evil.example/dashboard.html", true, "customer_42", receipt),
  ("https://shopkinto.com/dashboard.html", false, "customer_42", receipt),
  ("https://shopkinto.com/index.html", true, "customer_42", receipt),
  ("https://shopkinto.com/dashboard.html", true, "customer_other", receipt),
  ("https://shopkinto.com/dashboard.html", true, "customer_42", receipt + "&requestKey=" + key)
] {
    do { try reopened.removeAfterVerifiedReceipt(receiptURL: url, sourceURL: from, mainFrame: main, accountID: active); fatalError("Invalid receipt accepted") } catch {}
}
precondition(try reopened.pending(accountID: "customer_42")?.requestKey == key)
try reopened.removeAfterVerifiedReceipt(receiptURL: receipt, sourceURL: "https://shopkinto.com/dashboard.html", mainFrame: true, accountID: "customer_42")
precondition(try reopened.pending(accountID: "customer_42") == nil)
print("Pending draft retry, account binding and receipt guards passed")
