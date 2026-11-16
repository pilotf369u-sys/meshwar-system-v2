import Foundation

// Local pending state only; this type never opens URLs or sends a request.
// A matching callback is not by itself proof of a server-side order.
final class PendingWorldOrder {
    private struct Record: Codable { let accountID: String; let draft: WorldOrderHandoff.Draft }
    enum Rejection: Error { case invalidAccount, pendingExists, mismatch, corrupt }
    private static let lock = NSLock()
    private let path: URL
    init(path: URL) { self.path = path }

    private func readUnlocked() throws -> Record? {
        guard FileManager.default.fileExists(atPath: path.path) else { return nil }
        let data = try Data(contentsOf: path)
        guard data.count <= 160000, let record = try? JSONDecoder().decode(Record.self, from: data),
              validAccount(record.accountID), (try? WorldOrderHandoff.reviewURL(record.draft)) != nil
        else { throw Rejection.corrupt }
        return record
    }

    private func validAccount(_ value: String) -> Bool {
        !value.isEmpty && value.utf8.count <= 128 &&
        value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil
    }

    func pending(accountID: String) throws -> WorldOrderHandoff.Draft? {
        Self.lock.lock(); defer { Self.lock.unlock() }
        guard validAccount(accountID) else { throw Rejection.invalidAccount }
        guard let record = try readUnlocked() else { return nil }
        guard record.accountID == accountID else { throw Rejection.mismatch }
        return record.draft
    }

    func prepare(_ draft: WorldOrderHandoff.Draft, accountID: String) throws -> URL {
        Self.lock.lock(); defer { Self.lock.unlock() }
        guard validAccount(accountID) else { throw Rejection.invalidAccount }
        let result = try WorldOrderHandoff.reviewURL(draft)
        if let existing = try readUnlocked() {
            guard existing.accountID == accountID, existing.draft == draft else { throw Rejection.pendingExists }
            return result
        }
        let data = try JSONEncoder().encode(Record(accountID: accountID, draft: draft))
        try FileManager.default.createDirectory(at: path.deletingLastPathComponent(), withIntermediateDirectories: true)
        try data.write(to: path, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return result
    }

    // Call only after the existing KINTO server receipt has been independently verified.
    func removeAfterVerifiedReceipt(receiptURL: String, sourceURL: String, mainFrame: Bool, accountID: String) throws {
        Self.lock.lock(); defer { Self.lock.unlock() }
        guard validAccount(accountID), mainFrame,
              KintoURLPolicy.classify(sourceURL) == .account,
              let source = URLComponents(string: sourceURL), source.path == "/dashboard.html",
              let receipt = URLComponents(string: receiptURL),
              receipt.scheme == "kinto-app", receipt.host == "world-submitted",
              receipt.user == nil, receipt.password == nil, receipt.port == nil,
              receipt.path.isEmpty, receipt.fragment == nil,
              let items = receipt.queryItems, items.count == 1,
              items[0].name == "requestKey", let key = items[0].value, UUID(uuidString: key) != nil,
              let record = try readUnlocked(), record.accountID == accountID,
              record.draft.requestKey.lowercased() == key.lowercased()
        else { throw Rejection.mismatch }
        try FileManager.default.removeItem(at: path)
    }
}
