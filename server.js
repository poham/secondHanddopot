const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(cors());
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// 設置圖片上傳
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

// 初始化資料庫
const db = new sqlite3.Database('exchange.db');

// 創建資料表
db.serialize(() => {
  // 用戶表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // 商品表
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    condition_desc TEXT,
    price INTEGER DEFAULT 0,
    image_url TEXT,
    user_id INTEGER,
    status TEXT DEFAULT 'available',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 評論表
  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    user_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 叫價表
  db.run(`CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    user_id INTEGER,
    amount INTEGER NOT NULL,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // 交易表
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    buyer_id INTEGER,
    seller_id INTEGER,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (buyer_id) REFERENCES users (id),
    FOREIGN KEY (seller_id) REFERENCES users (id)
  )`);

  // 商品修改紀錄表
  db.run(`CREATE TABLE IF NOT EXISTS product_edits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    field_name TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    edited_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id)
  )`);
});

// 中間件：驗證JWT
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.sendStatus(401);
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
};

// 用戶註冊
app.post('/api/register', async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  
  db.run('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
    [username, email, hashedPassword], function(err) {
      if (err) return res.status(400).json({ error: '用戶已存在' });
      res.json({ message: '註冊成功', userId: this.lastID });
    });
});

// 用戶登入
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (err || !user) return res.status(400).json({ error: '用戶不存在' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: '密碼錯誤' });
    
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  });
});

// 獲取所有商品
app.get('/api/products', (req, res) => {
  db.all(`SELECT p.*, u.username FROM products p 
          JOIN users u ON p.user_id = u.id 
          WHERE p.status = 'available'
          ORDER BY p.created_at DESC`, (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(products);
  });
});

// 新增商品（含圖片上傳）
app.post('/api/products', authenticateToken, upload.single('image'), (req, res) => {
  const { title, description, category, condition_desc, price } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  
  db.run('INSERT INTO products (title, description, category, condition_desc, price, image_url, user_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, description, category, condition_desc, price || 0, image_url, req.user.userId], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '商品發布成功', productId: this.lastID });
    });
});

// 修改商品
app.put('/api/products/:id', authenticateToken, upload.single('image'), (req, res) => {
  const productId = req.params.id;
  const { title, description, category, condition_desc, price } = req.body;
  
  // 先獲取原商品資料
  db.get('SELECT * FROM products WHERE id = ? AND user_id = ?', [productId, req.user.userId], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: '商品不存在或無權限修改' });
    
    const updates = [];
    const values = [];
    const edits = [];
    
    // 檢查並記錄變更
    if (title && title !== product.title) {
      updates.push('title = ?');
      values.push(title);
      edits.push(['title', product.title, title]);
    }
    if (description && description !== product.description) {
      updates.push('description = ?');
      values.push(description);
      edits.push(['description', product.description, description]);
    }
    if (category && category !== product.category) {
      updates.push('category = ?');
      values.push(category);
      edits.push(['category', product.category, category]);
    }
    if (condition_desc && condition_desc !== product.condition_desc) {
      updates.push('condition_desc = ?');
      values.push(condition_desc);
      edits.push(['condition_desc', product.condition_desc, condition_desc]);
    }
    if (price && price != product.price) {
      updates.push('price = ?');
      values.push(price);
      edits.push(['price', product.price.toString(), price.toString()]);
    }
    if (req.file) {
      const image_url = `/uploads/${req.file.filename}`;
      updates.push('image_url = ?');
      values.push(image_url);
      edits.push(['image_url', product.image_url, image_url]);
    }
    
    if (updates.length === 0) {
      return res.json({ message: '沒有變更' });
    }
    
    values.push(productId);
    
    // 更新商品
    db.run(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`, values, function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      // 記錄修改歷史
      edits.forEach(([field, oldVal, newVal]) => {
        db.run('INSERT INTO product_edits (product_id, field_name, old_value, new_value) VALUES (?, ?, ?, ?)',
          [productId, field, oldVal, newVal]);
      });
      
      res.json({ message: '商品修改成功' });
    });
  });
});

// 獲取商品修改紀錄
app.get('/api/products/:id/edits', (req, res) => {
  db.all('SELECT * FROM product_edits WHERE product_id = ? ORDER BY edited_at DESC', 
    [req.params.id], (err, edits) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(edits);
    });
});

// 獲取商品詳情
app.get('/api/products/:id', (req, res) => {
  db.get(`SELECT p.*, u.username FROM products p 
          JOIN users u ON p.user_id = u.id 
          WHERE p.id = ?`, [req.params.id], (err, product) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!product) return res.status(404).json({ error: '商品不存在' });
    res.json(product);
  });
});

// 新增評論
app.post('/api/products/:id/comments', authenticateToken, (req, res) => {
  const { content } = req.body;
  
  db.run('INSERT INTO comments (product_id, user_id, content) VALUES (?, ?, ?)',
    [req.params.id, req.user.userId, content], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '評論發布成功', commentId: this.lastID });
    });
});

// 獲取評論
app.get('/api/products/:id/comments', (req, res) => {
  db.all(`SELECT c.*, u.username FROM comments c 
          JOIN users u ON c.user_id = u.id 
          WHERE c.product_id = ? 
          ORDER BY c.created_at DESC`, [req.params.id], (err, comments) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(comments);
  });
});

// 新增叫價
app.post('/api/products/:id/bids', authenticateToken, (req, res) => {
  const { amount, message } = req.body;
  
  db.run('INSERT INTO bids (product_id, user_id, amount, message) VALUES (?, ?, ?, ?)',
    [req.params.id, req.user.userId, amount, message], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: '叫價成功', bidId: this.lastID });
    });
});

// 獲取叫價
app.get('/api/products/:id/bids', (req, res) => {
  db.all(`SELECT b.*, u.username FROM bids b 
          JOIN users u ON b.user_id = u.id 
          WHERE b.product_id = ? 
          ORDER BY b.amount DESC`, [req.params.id], (err, bids) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(bids);
  });
});

// 獲取商品列表
app.get('/api/products', (req, res) => {
  db.all(`SELECT p.*, u.username as seller_name FROM products p 
          JOIN users u ON p.user_id = u.id 
          ORDER BY p.created_at DESC`, (err, products) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(products);
  });
});

// 管理員API - 獲取所有用戶
app.get('/api/admin/users', (req, res) => {
  db.all('SELECT id, username, email, created_at FROM users ORDER BY created_at DESC', (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(users);
  });
});

// 管理員API - 刪除用戶
app.delete('/api/admin/users/:id', (req, res) => {
  db.run('DELETE FROM users WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '用戶已刪除' });
  });
});

// 管理員API - 刪除商品
app.delete('/api/admin/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: '商品已刪除' });
  });
});

// 重設密碼API
app.post('/api/reset-password', (req, res) => {
  const { email, newPassword } = req.body;
  
  if (!email || !newPassword) {
    return res.status(400).json({ error: '請提供郵箱和新密碼' });
  }
  
  const hashedPassword = bcrypt.hashSync(newPassword, 10);
  
  db.run('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: '用戶不存在' });
    res.json({ message: '密碼重設成功' });
  });
});

// 創建交易
app.post('/api/transactions', authenticateToken, (req, res) => {
  const { productId } = req.body;
  
  db.get('SELECT * FROM products WHERE id = ?', [productId], (err, product) => {
    if (err || !product) return res.status(404).json({ error: '商品不存在' });
    
    db.run('INSERT INTO transactions (product_id, buyer_id, seller_id) VALUES (?, ?, ?)',
      [productId, req.user.userId, product.user_id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: '交易請求已發送', transactionId: this.lastID });
      });
  });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`伺服器運行在 http://localhost:${PORT}`);
});
