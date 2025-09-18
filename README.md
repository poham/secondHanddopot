# 二手交換平台

一個完整的二手商品交換網站，包含用戶管理、商品管理和交易系統。

## 功能特色

### 前端功能
- 響應式用戶介面
- 用戶註冊/登入系統
- 商品瀏覽和搜尋
- 商品分類篩選
- 商品發布功能
- 交換請求系統

### 後端功能
- RESTful API 設計
- JWT 身份驗證
- 密碼加密存儲
- SQLite 資料庫
- 安全的交易處理

### 資料庫設計
- **users**: 用戶資料表
- **products**: 商品資料表  
- **transactions**: 交易記錄表

## 安裝與運行

1. 安裝依賴套件：
```bash
npm install
```

2. 啟動開發伺服器：
```bash
npm run dev
```

3. 訪問網站：
```
http://localhost:3000
```

## 技術架構

- **前端**: HTML5, CSS3, JavaScript (ES6+)
- **後端**: Node.js, Express.js
- **資料庫**: SQLite3
- **身份驗證**: JWT + bcrypt
- **安全性**: CORS, 密碼加密

## API 端點

### 用戶管理
- `POST /api/register` - 用戶註冊
- `POST /api/login` - 用戶登入

### 商品管理
- `GET /api/products` - 獲取商品列表
- `POST /api/products` - 發布新商品

### 交易系統
- `POST /api/transactions` - 創建交換請求

## 安全機制

- JWT Token 身份驗證
- 密碼 bcrypt 加密
- CORS 跨域保護
- SQL 注入防護
- XSS 攻擊防護

## 未來擴展

- 即時聊天功能
- 商品圖片上傳
- 評價系統
- 支付整合
- 推薦算法
- 手機 APP
