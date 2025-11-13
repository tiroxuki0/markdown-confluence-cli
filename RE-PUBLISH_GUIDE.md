# 🔄 Republish Guide for Markdown-Confluence-Sync Packages

> **Hướng dẫn chi tiết để republish tất cả packages trong monorepo lên npm registry**

## 📋 Tổng quan

Monorepo này chứa 5 packages cần được republish theo thứ tự phụ thuộc:
- `md-confluence-lib` (core library - publish đầu tiên)
- `md-confluence-mermaid-electron-renderer`
- `md-confluence-mermaid-puppeteer-renderer`
- `md-confluence-cli` (sử dụng file: dependencies)
- `obsidian-confluence`

## 🎯 Quy trình Republish

### Bước 1: Kiểm tra phiên bản hiện tại
```bash
cd /Users/huyvo/Desktop/markdown-confluence-sync
grep '"version"' packages/*/package.json
```

### Bước 2: Tăng phiên bản (Version Bump)
Cập nhật phiên bản từ `X.Y.Z` lên `X.Y.(Z+1)` trong tất cả file `package.json`:

**packages/lib/package.json:**
```json
{
  "version": "5.6.67"
}
```

**packages/cli/package.json:**
```json
{
  "version": "5.6.67",
  "devDependencies": {
    "md-confluence-lib": "file:../lib",
    "md-confluence-mermaid-puppeteer-renderer": "file:../mermaid-puppeteer-renderer"
  }
}
```

**packages/mermaid-electron-renderer/package.json:**
```json
{
  "version": "5.6.67",
  "dependencies": {
    "md-confluence-lib": "5.6.67"
  }
}
```

**packages/mermaid-puppeteer-renderer/package.json:**
```json
{
  "version": "5.6.67",
  "dependencies": {
    "md-confluence-lib": "5.6.67"
  }
}
```

**packages/obsidian/package.json:**
```json
{
  "version": "5.6.67",
  "dependencies": {
    "md-confluence-lib": "5.6.67",
    "md-confluence-mermaid-electron-renderer": "5.6.67"
  }
}
```

### Bước 3: Build tất cả packages
```bash
cd /Users/huyvo/Desktop/markdown-confluence-sync
npm run build
```

### Bước 4: Publish theo thứ tự phụ thuộc

#### 4.1. Publish md-confluence-lib (đầu tiên)
```bash
cd packages/lib
npm publish
```

#### 4.2. Publish md-confluence-mermaid-electron-renderer
```bash
cd ../mermaid-electron-renderer
npm publish
```

#### 4.3. Publish md-confluence-mermaid-puppeteer-renderer
```bash
cd ../mermaid-puppeteer-renderer
npm publish
```

#### 4.4. Publish md-confluence-cli
```bash
cd ../cli
npm publish
```

#### 4.5. Publish obsidian-confluence (cuối cùng)
```bash
cd ../obsidian
npm publish
```

### Bước 5: Commit và Push changes
```bash
cd /Users/huyvo/Desktop/markdown-confluence-sync
git add .
git commit -m "chore: bump version to 5.6.67"
git push
```

## ⚠️ Lưu ý quan trọng

### Thứ tự publish bắt buộc
1. **md-confluence-lib** → Các package khác phụ thuộc vào nó
2. **Renderers** (electron + puppeteer)
3. **CLI** (sử dụng file: dependencies cho development)
4. **Obsidian plugin** (cuối cùng)

### File Dependencies trong CLI
CLI package sử dụng `file:` protocol cho local development:
```json
{
  "devDependencies": {
    "md-confluence-lib": "file:../lib",
    "md-confluence-mermaid-puppeteer-renderer": "file:../mermaid-puppeteer-renderer"
  }
}
```

### Version Consistency
- Tất cả packages phải có cùng version number
- Dependencies trong package.json phải được cập nhật tương ứng

## 🔍 Kiểm tra sau khi publish
```bash
# Kiểm tra phiên bản đã publish
npm view md-confluence-lib version
npm view md-confluence-cli version
npm view md-confluence-mermaid-electron-renderer version
npm view md-confluence-mermaid-puppeteer-renderer version
npm view obsidian-confluence version
```

## 🚨 Troubleshooting

### Lỗi 403 Forbidden
```
npm error 403 403 Forbidden - PUT https://registry.npmjs.org/... - You cannot publish over the previously published versions
```
**Giải pháp:** Tăng version number lên 1 đơn vị

### Build thất bại
```
Error: TypeScript compilation failed
```
**Giải pháp:** Fix TypeScript errors trước khi build

### Dependency conflicts
```
npm error code ERESOLVE
```
**Giải pháp:** Đảm bảo lib được publish trước khi publish các package khác

### Git conflicts
```
error: failed to push some refs
```
**Giải pháp:** Pull changes từ remote trước khi push

## 📊 Thời gian thực hiện
- Build: ~2-3 phút
- Publish tất cả: ~1-2 phút
- Commit + Push: ~30 giây
- **Tổng cộng: ~4-6 phút**

## ✅ Checklist sau khi hoàn thành

- [ ] Tất cả packages được publish thành công
- [ ] Version number consistent
- [ ] Git commit và push thành công
- [ ] npm view xác nhận phiên bản mới
- [ ] Không có lỗi build hoặc publish

## 🎯 Ví dụ phiên bản bump

**Trước:**
```
packages/cli/package.json:    "version": "5.6.66"
packages/lib/package.json:    "version": "5.6.66"
packages/mermaid-electron-renderer/package.json:    "version": "5.6.66"
packages/mermaid-puppeteer-renderer/package.json:    "version": "5.6.66"
packages/obsidian/package.json:    "version": "5.6.66"
```

**Sau:**
```
packages/cli/package.json:    "version": "5.6.67"
packages/lib/package.json:    "version": "5.6.67"
packages/mermaid-electron-renderer/package.json:    "version": "5.6.67"
packages/mermaid-puppeteer-renderer/package.json:    "version": "5.6.67"
packages/obsidian/package.json:    "version": "5.6.67"
```

---

**🚀 Ready to republish!** Thực hiện theo thứ tự và không bỏ qua bất kỳ bước nào.
