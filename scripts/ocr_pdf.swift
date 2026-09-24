// IPA公開問題PDF（画像PDF）をページPNGに書き出し、macOS Vision で日本語OCRする。
// 使い方: swift scripts/ocr_pdf.swift <in.pdf> <outDir>
//   outDir/pNN.png  … ページ画像（図表問題の確認・切り出し用）
//   outDir/pNN.json … [{text, x, y, w, h, conf}]（座標は左上原点・0〜1）
import Foundation
import PDFKit
import Vision
import AppKit

let args = CommandLine.arguments
guard args.count >= 3, let doc = PDFDocument(url: URL(fileURLWithPath: args[1])) else {
  print("usage: swift ocr_pdf.swift <in.pdf> <outDir>"); exit(1)
}
let outDir = URL(fileURLWithPath: args[2])
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let scale: CGFloat = 2.5

for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let size = NSSize(width: box.width * scale, height: box.height * scale)
  let img = page.thumbnail(of: size, for: .mediaBox)
  guard let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
        let png = rep.representation(using: .png, properties: [:]), let cg = rep.cgImage else { continue }
  let name = String(format: "p%02d", i)
  try png.write(to: outDir.appendingPathComponent("\(name).png"))

  let req = VNRecognizeTextRequest()
  req.recognitionLanguages = ["ja-JP", "en-US"]
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = true
  try VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
  var lines: [[String: Any]] = []
  for obs in req.results ?? [] {
    guard let c = obs.topCandidates(1).first else { continue }
    let b = obs.boundingBox
    lines.append(["text": c.string, "x": b.minX, "y": 1 - b.maxY, "w": b.width, "h": b.height, "conf": c.confidence])
  }
  let data = try JSONSerialization.data(withJSONObject: lines, options: [.prettyPrinted])
  try data.write(to: outDir.appendingPathComponent("\(name).json"))
  FileHandle.standardError.write("\(name) \(lines.count) lines\n".data(using: .utf8)!)
}
