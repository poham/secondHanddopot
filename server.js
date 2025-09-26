const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
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

// JSON 資料庫文件
const DB_FILE = 'data.json';

// 初始化資料庫
function initDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      products: [],
      likes: [],
      conversations: [],
      messages: [],
      nextUserId: 1,
      nextProductId: 1,
      nextConversationId: 1,
      nextMessageId: 1
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
  } else {
    // 確保現有資料庫有新欄位
    const data = readDB();
    let updated = false;
    if (!data.conversations) { data.conversations = []; updated = true; }
    if (!data.messages) { data.messages = []; updated = true; }
    if (!data.nextConversationId) { data.nextConversationId = 1; updated = true; }
    if (!data.nextMessageId) { data.nextMessageId = 1; updated = true; }
    if (updated) writeDB(data);
  }
}

// 讀取資料庫
function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

// 寫入資料庫
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

initDB();

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
  
  try {
    const db = readDB();
    
    // 檢查用戶是否已存在
    if (db.users.find(u => u.username === username || u.email === email)) {
      return res.status(400).json({ error: '用戶已存在' });
    }
    
    const newUser = {
      id: db.nextUserId++,
      username,
      email,
      password: hashedPassword,
      created_at: new Date().toISOString()
    };
    
    db.users.push(newUser);
    writeDB(db);
    
    res.json({ message: '註冊成功', userId: newUser.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 用戶登入
app.post('/api/login', async (req, res) => {
  const { username, email, password } = req.body;
  const loginField = username || email;
  
  try {
    const db = readDB();
    const user = db.users.find(u => u.username === loginField || u.email === loginField);
    
    if (!user) return res.status(400).json({ error: '用戶不存在' });
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: '密碼錯誤' });
    
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET);
    res.json({ 
      token, 
      username: user.username, 
      user: { id: user.id, username: user.username, email: user.email } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取所有商品
app.get('/api/products', (req, res) => {
  try {
    const db = readDB();
    const { category, search } = req.query;
    
    let products = db.products
      .map(p => {
        const user = db.users.find(u => u.id === p.user_id);
        const likes_count = db.likes ? db.likes.filter(like => like.product_id === p.id).length : 0;
        return { ...p, username: user ? user.username : 'Unknown', likes_count };
      });
    
    // 分類篩選
    if (category && category !== 'all') {
      products = products.filter(p => p.category === category);
    }
    
    // 搜尋篩選
    if (search) {
      const searchTerm = search.toLowerCase();
      products = products.filter(p => 
        p.title.toLowerCase().includes(searchTerm) ||
        p.description.toLowerCase().includes(searchTerm)
      );
    }
    
    // 按時間排序
    products = products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新增商品
app.post('/api/products', authenticateToken, upload.single('image'), (req, res) => {
  console.log('=== 後端 DEBUG: 接收到新增商品請求 ===');
  console.log('用戶 ID:', req.user.userId);
  console.log('請求體:', req.body);
  console.log('上傳的文件:', req.file ? req.file.filename : '無文件');
  
  const { title, description, category, condition_desc, price, quantity } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : null;
  
  console.log('📦 後端收到的商品數據:');
  console.log('  - 標題:', title);
  console.log('  - 描述:', description);
  console.log('  - 分類:', category);
  console.log('  - 狀況:', condition_desc);
  console.log('  - 價格:', price);
  console.log('  - 數量:', quantity);
  console.log('  - 圖片路徑:', image_url);
  
  if (!title || !description || !category || !condition_desc) {
    console.log('❌ 必填欄位未填寫');
    return res.status(400).json({ error: '請填寫所有必填欄位' });
  }
  
  try {
    const db = readDB();
    console.log('📖 讀取資料庫成功，當前商品數量:', db.products.length);
    
    const newProduct = {
      id: db.nextProductId++,
      title,
      description,
      category,
      condition_desc,
      price: parseInt(price) || 0,
      quantity: parseInt(quantity) || 1,
      image_url,
      user_id: req.user.userId,
      status: 'available',
      created_at: new Date().toISOString()
    };
    
    console.log('🆕 準備保存的新商品數據:');
    console.log(JSON.stringify(newProduct, null, 2));
    
    db.products.push(newProduct);
    writeDB(db);
    
    console.log('✅ 商品已成功保存到 data.json');
    console.log('📊 更新後資料庫商品總數:', db.products.length);
    console.log('🎯 新商品 ID:', newProduct.id);
    
    res.json({ message: '商品發布成功', productId: newProduct.id });
  } catch (err) {
    console.error('❌ 資料庫錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// 編輯商品
app.put('/api/products/:id', authenticateToken, upload.single('image'), (req, res) => {
  console.log('=== 後端 DEBUG: 接收到編輯商品請求 ===');
  const productId = parseInt(req.params.id);
  const { title, description, category, condition_desc, price, quantity } = req.body;
  
  try {
    const db = readDB();
    const productIndex = db.products.findIndex(p => p.id === productId);
    
    if (productIndex === -1) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    const product = db.products[productIndex];
    
    // 檢查商品是否已售出
    if (product.is_sold) {
      return res.status(400).json({ error: '商品已售出，無法編輯' });
    }
    
    // 檢查是否為商品擁有者
    if (product.user_id !== req.user.userId) {
      return res.status(403).json({ error: '只能編輯自己的商品' });
    }
    
    // 記錄修改前的數據
    const oldData = { ...product };
    
    // 更新商品數據
    const newImageUrl = req.file ? `/uploads/${req.file.filename}` : product.image_url;
    
    db.products[productIndex] = {
      ...product,
      title: title || product.title,
      description: description || product.description,
      category: category || product.category,
      condition_desc: condition_desc || product.condition_desc,
      price: price ? parseInt(price) : product.price,
      quantity: quantity ? parseInt(quantity) : product.quantity,
      image_url: newImageUrl,
      updated_at: new Date().toISOString()
    };
    
    // 記錄編輯歷史
    if (!db.editHistory) db.editHistory = [];
    if (!db.nextEditId) db.nextEditId = 1;
    
    db.editHistory.push({
      id: db.nextEditId++,
      product_id: productId,
      user_id: req.user.userId,
      old_data: oldData,
      new_data: db.products[productIndex],
      edited_at: new Date().toISOString()
    });
    
    writeDB(db);
    
    console.log('✅ 商品編輯成功，ID:', productId);
    res.json({ message: '商品編輯成功', product: db.products[productIndex] });
  } catch (err) {
    console.error('❌ 編輯商品錯誤:', err);
    res.status(500).json({ error: err.message });
  }
});

// 獲取商品編輯歷史
app.get('/api/products/:id/history', authenticateToken, (req, res) => {
  const productId = parseInt(req.params.id);
  
  try {
    const db = readDB();
    const product = db.products.find(p => p.id === productId);
    
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    // 只有商品擁有者可以查看編輯歷史
    if (product.user_id !== req.user.userId) {
      return res.status(403).json({ error: '只能查看自己商品的編輯歷史' });
    }
    
    const history = db.editHistory ? db.editHistory.filter(h => h.product_id === productId) : [];
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取用戶商品
app.get('/api/user/products', authenticateToken, (req, res) => {
  console.log('API調用 - 用戶商品，用戶ID:', req.user.userId);
  try {
    const db = readDB();
    const userProducts = db.products
      .filter(p => p.user_id === req.user.userId)
      .map(p => {
        const user = db.users.find(u => u.id === p.user_id);
        const likes_count = db.likes ? db.likes.filter(like => like.product_id === p.id).length : 0;
        return { ...p, username: user ? user.username : 'Unknown', likes_count };
      });
    console.log('找到商品數量:', userProducts.length);
    res.json(userProducts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API 已移除 - 使用收件夾通知系統代替交易記錄

// 按讚 API
app.post('/api/likes', authenticateToken, (req, res) => {
  const { productId } = req.body;
  const userId = req.user.userId; // 修正：使用 userId 而不是 id
  
  try {
    const data = readDB();
    if (!data.likes) data.likes = [];
    
    const existingLike = data.likes.find(like => like.user_id === userId && like.product_id === productId);
    
    if (existingLike) {
      // 取消按讚
      data.likes = data.likes.filter(like => !(like.user_id === userId && like.product_id === productId));
      writeDB(data);
      res.json({ message: '取消按讚' });
    } else {
      // 新增按讚
      const newLike = {
        id: data.likes.length > 0 ? Math.max(...data.likes.map(l => l.id)) + 1 : 1,
        user_id: userId,
        product_id: productId,
        created_at: new Date().toISOString()
      };
      data.likes.push(newLike);
      writeDB(data);
      res.json({ message: '按讚成功' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 購物車 API
app.post('/api/cart', authenticateToken, (req, res) => {
  const { productId } = req.body;
  const userId = req.user.userId;
  
  try {
    const db = readDB();
    const product = db.products.find(p => p.id === parseInt(productId));
    
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    if (product.user_id === userId) {
      return res.status(400).json({ error: '不能將自己的商品加入購物車' });
    }
    
    if (!db.carts) db.carts = [];
    
    const existingCart = db.carts.find(c => c.user_id === userId && c.product_id === parseInt(productId));
    if (existingCart) {
      return res.status(400).json({ error: '商品已在購物車中' });
    }
    
    const newCartItem = {
      id: db.carts.length > 0 ? Math.max(...db.carts.map(c => c.id)) + 1 : 1,
      user_id: userId,
      product_id: parseInt(productId),
      quantity: 1,
      created_at: new Date().toISOString()
    };
    
    db.carts.push(newCartItem);
    writeDB(db);
    
    res.json({ message: '已加入購物車' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取用戶購物車
app.get('/api/user/cart', authenticateToken, (req, res) => {
  try {
    const db = readDB();
    const userCart = db.carts ? db.carts.filter(c => c.user_id === req.user.userId) : [];
    const cartProducts = userCart.map(cart => {
      const product = db.products.find(p => p.id === cart.product_id);
      return product ? { ...product, cart_id: cart.id, quantity: cart.quantity, added_at: cart.created_at } : null;
    }).filter(Boolean);
    
    res.json(cartProducts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 從購物車移除商品
app.delete('/api/user/cart', authenticateToken, (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.userId;
    
    const db = readDB();
    
    if (!db.carts) {
      return res.status(404).json({ error: '購物車為空' });
    }
    
    const cartIndex = db.carts.findIndex(c => c.user_id === userId && c.product_id === parseInt(productId));
    
    if (cartIndex === -1) {
      return res.status(404).json({ error: '商品不在購物車中' });
    }
    
    db.carts.splice(cartIndex, 1);
    writeDB(db);
    
    res.json({ message: '已從購物車移除' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 收藏 API
app.post('/api/favorites', authenticateToken, (req, res) => {
  const { productId } = req.body;
  const userId = req.user.userId;
  
  try {
    const db = readDB();
    const product = db.products.find(p => p.id === productId);
    
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    if (product.user_id === userId) {
      return res.status(400).json({ error: '不能收藏自己的商品' });
    }
    
    if (!db.favorites) db.favorites = [];
    
    const existingFavorite = db.favorites.find(f => f.user_id === userId && f.product_id === productId);
    if (existingFavorite) {
      return res.status(400).json({ error: '已經收藏過此商品' });
    }
    
    const newFavorite = {
      id: db.favorites.length > 0 ? Math.max(...db.favorites.map(f => f.id)) + 1 : 1,
      user_id: userId,
      product_id: productId,
      created_at: new Date().toISOString()
    };
    
    db.favorites.push(newFavorite);
    writeDB(db);
    
    res.json({ message: '收藏成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 刪除收藏 API
app.delete('/api/user/favorites', authenticateToken, (req, res) => {
  try {
    const { productId } = req.body;
    const userId = req.user.userId;
    const db = readDB();
    
    if (!db.favorites) {
      return res.status(404).json({ error: '沒有收藏記錄' });
    }
    
    const favoriteIndex = db.favorites.findIndex(f => f.user_id === userId && f.product_id === productId);
    
    if (favoriteIndex === -1) {
      return res.status(404).json({ error: '未找到收藏記錄' });
    }
    
    db.favorites.splice(favoriteIndex, 1);
    writeDB(db);
    
    res.json({ message: '已從收藏中移除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 購買 API
app.post('/api/purchase', authenticateToken, (req, res) => {
  res.json({ message: '購買成功' });
});

// 獲取商品評論
app.get('/api/comments/:productId', (req, res) => {
  try {
    const db = readDB();
    const productComments = db.comments ? db.comments.filter(c => c.product_id === parseInt(req.params.productId)) : [];
    
    const commentsWithUsers = productComments.map(comment => {
      const user = db.users.find(u => u.id === comment.user_id);
      return {
        ...comment,
        username: user ? user.username : 'Unknown'
      };
    });
    
    res.json(commentsWithUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取用戶收藏
app.get('/api/user/favorites', authenticateToken, (req, res) => {
  console.log('API調用 - 用戶收藏，用戶ID:', req.user.userId);
  try {
    const db = readDB();
    const userFavorites = db.favorites ? db.favorites.filter(f => f.user_id === req.user.userId) : [];
    console.log('找到收藏數量:', userFavorites.length);
    const favoriteProducts = userFavorites.map(fav => {
      const product = db.products.find(p => p.id === fav.product_id);
      if (product) {
        const user = db.users.find(u => u.id === product.user_id);
        const likes_count = db.likes ? db.likes.filter(like => like.product_id === product.id).length : 0;
        return { ...product, username: user ? user.username : 'Unknown', likes_count, favorited_at: fav.created_at };
      }
      return null;
    }).filter(Boolean);
    res.json(favoriteProducts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 添加留言
app.post('/api/comments', authenticateToken, (req, res) => {
  const { product_id, content, parent_id } = req.body;
  
  try {
    const db = readDB();
    
    // 檢查商品是否存在
    const product = db.products.find(p => p.id === parseInt(product_id));
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    // 如果是回覆，檢查父留言是否存在
    let parentComment = null;
    if (parent_id) {
      parentComment = db.comments.find(c => c.id === parseInt(parent_id));
      if (!parentComment) {
        return res.status(404).json({ error: '父留言不存在' });
      }
    }
    
    // 添加留言
    if (!db.comments) db.comments = [];
    if (!db.nextCommentId) db.nextCommentId = 1;
    
    const newComment = {
      id: db.nextCommentId++,
      product_id: parseInt(product_id),
      user_id: req.user.userId,
      content: content,
      parent_id: parent_id ? parseInt(parent_id) : null,
      created_at: new Date().toISOString()
    };
    
    db.comments.push(newComment);
    
    // 發送通知
    if (!db.notifications) db.notifications = [];
    if (!db.nextNotificationId) db.nextNotificationId = 1;
    
    const commenterUser = db.users.find(u => u.id === req.user.userId);
    
    if (parent_id && parentComment) {
      // 回覆通知 - 通知被回覆的用戶
      if (parentComment.user_id !== req.user.userId) {
        db.notifications.push({
          id: db.nextNotificationId++,
          user_id: parentComment.user_id,
          type: 'comment_reply',
          product_id: parseInt(product_id),
          product_title: product.title,
          comment_id: newComment.id,
          parent_comment_id: parseInt(parent_id),
          content: `${commenterUser?.username || '用戶'} 回覆了你在「${product.title}」的留言：${content}`,
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
    } else {
      // 新留言通知 - 通知商品擁有者
      if (product.user_id !== req.user.userId) {
        db.notifications.push({
          id: db.nextNotificationId++,
          user_id: product.user_id,
          type: 'comment',
          product_id: parseInt(product_id),
          product_title: product.title,
          comment_id: newComment.id,
          content: `${commenterUser?.username || '用戶'} 在你的商品「${product.title}」留言：${content}`,
          is_read: false,
          created_at: new Date().toISOString()
        });
      }
    }
    
    writeDB(db);
    res.json({ message: '留言成功', comment: newComment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 購買確認請求
app.post('/api/purchase-request', authenticateToken, (req, res) => {
  const { product_id, message } = req.body;
  
  try {
    const db = readDB();
    
    const product = db.products.find(p => p.id === parseInt(product_id));
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    if (product.user_id === req.user.userId) {
      return res.status(400).json({ error: '不能購買自己的商品' });
    }
    
    if (product.is_sold) {
      return res.status(400).json({ error: '商品已售出' });
    }
    
    // 創建購買請求通知
    if (!db.notifications) db.notifications = [];
    if (!db.nextNotificationId) db.nextNotificationId = 1;
    
    const buyerUser = db.users.find(u => u.id === req.user.userId);
    
    // 設置商品為處理中狀態
    product.status = 'processing';
    product.processing_buyer_id = req.user.userId;
    
    db.notifications.push({
      id: db.nextNotificationId++,
      user_id: product.user_id,
      type: 'purchase_request',
      product_id: parseInt(product_id),
      product_title: product.title,
      buyer_id: req.user.userId,
      buyer_name: buyerUser?.username || '買家',
      content: `${buyerUser?.username || '買家'} 想要購買你的商品「${product.title}」，點擊開始討論交易細節`,
      message: message || '',
      status: 'pending',
      is_read: false,
      created_at: new Date().toISOString()
    });
    
    writeDB(db);
    res.json({ message: '購買請求已發送' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 處理購買請求
app.post('/api/purchase-response', authenticateToken, (req, res) => {
  const { notification_id, action } = req.body; // action: 'accept' or 'reject'
  
  try {
    const db = readDB();
    
    const notification = db.notifications.find(n => n.id === parseInt(notification_id));
    if (!notification) {
      return res.status(404).json({ error: '通知不存在' });
    }
    
    if (notification.user_id !== req.user.userId) {
      return res.status(403).json({ error: '無權限操作' });
    }
    
    const product = db.products.find(p => p.id === notification.product_id);
    if (!product) {
      return res.status(404).json({ error: '商品不存在' });
    }
    
    if (action === 'accept') {
      // 接受購買 - 標記商品為已售出
      product.is_sold = true;
      product.sold_to = notification.buyer_id;
      product.sold_at = new Date().toISOString();
      product.status = 'sold';
      delete product.processing_buyer_id;
      
      // 通知買家購買成功
      const sellerUser = db.users.find(u => u.id === product.user_id);
      db.notifications.push({
        id: db.nextNotificationId++,
        user_id: notification.buyer_id,
        type: 'purchase_accepted',
        product_id: product.id,
        product_title: product.title,
        seller_id: product.user_id,
        seller_name: sellerUser ? sellerUser.username : '未知賣家',
        seller_email: sellerUser ? sellerUser.email : '未知',
        content: `恭喜！你的購買請求已被接受，商品「${product.title}」現在屬於你了！`,
        status: 'completed',
        is_read: false,
        created_at: new Date().toISOString()
      });
      
      // 通知賣家交易完成
      const buyerUser = db.users.find(u => u.id === notification.buyer_id);
      db.notifications.push({
        id: db.nextNotificationId++,
        user_id: product.user_id,
        type: 'item_sold',
        product_id: product.id,
        product_title: product.title,
        buyer_id: notification.buyer_id,
        buyer_name: buyerUser ? buyerUser.username : '未知買家',
        buyer_email: buyerUser ? buyerUser.email : '未知',
        content: `你的商品「${product.title}」已成功售出給 ${buyerUser ? buyerUser.username : '未知買家'}！`,
        status: 'completed',
        is_read: false,
        created_at: new Date().toISOString()
      });
      
      // 拒絕其他待處理的購買請求
      db.notifications.forEach(n => {
        if (n.product_id === product.id && n.type === 'purchase_request' && n.status === 'pending' && n.id !== notification.id) {
          n.status = 'rejected';
          // 通知其他買家
          db.notifications.push({
            id: db.nextNotificationId++,
            user_id: n.buyer_id,
            type: 'purchase_rejected',
            product_id: product.id,
            product_title: product.title,
            content: `很抱歉，商品「${product.title}」已被其他買家購買`,
            is_read: false,
            created_at: new Date().toISOString()
          });
        }
      });
    } else if (action === 'reject') {
      // 拒絕購買 - 重置商品狀態為可購買
      product.status = 'available';
      delete product.processing_buyer_id;
      
      // 通知買家購買被拒絕
      db.notifications.push({
        id: db.nextNotificationId++,
        user_id: notification.buyer_id,
        type: 'purchase_rejected',
        product_id: product.id,
        product_title: product.title,
        content: `很抱歉，賣家拒絕了你對商品「${product.title}」的購買請求`,
        is_read: false,
        created_at: new Date().toISOString()
      });
    }
    
    // 更新通知狀態
    notification.status = action === 'accept' ? 'accepted' : 'rejected';
    notification.is_read = true;
    
    writeDB(db);
    res.json({ message: action === 'accept' ? '已接受購買請求' : '已拒絕購買請求' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取所有用戶大頭貼
app.get('/api/users/avatars', (req, res) => {
  try {
    const db = readDB();
    const userAvatars = db.users.map(user => ({
      id: user.id,
      username: user.username,
      avatar_url: user.avatar_url || null
    }));
    res.json(userAvatars);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取通知
app.get('/api/notifications', authenticateToken, (req, res) => {
  try {
    const db = readDB();
    const userId = req.user.userId;
    
    // 獲取用戶收到的通知
    const receivedNotifications = db.notifications ? db.notifications.filter(n => n.user_id === userId) : [];
    
    // 獲取用戶發出的購買請求 (狀態為pending的)
    const sentRequests = db.notifications ? db.notifications.filter(n => 
      n.type === 'purchase_request' && 
      n.buyer_id === userId && 
      n.status === 'pending'
    ).map(n => ({
      ...n,
      user_id: userId, // 改為當前用戶ID
      isSentRequest: true // 標記為發出的請求
    })) : [];
    
    // 合併通知
    const allNotifications = [...receivedNotifications, ...sentRequests];
    
    // 為通知添加發送者用戶名稱
    const notificationsWithUsers = allNotifications.map(notification => {
      if (notification.sender_id) {
        const senderUser = db.users.find(u => u.id === notification.sender_id);
        return {
          ...notification,
          sender_name: senderUser ? senderUser.username : '用戶'
        };
      }
      return notification;
    });
    
    res.json(notificationsWithUsers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 批量標記所有通知為已讀
app.put('/api/notifications/mark-all-read', authenticateToken, (req, res) => {
  try {
    const db = readDB();
    const userId = req.user.userId;
    
    let markedCount = 0;
    db.notifications.forEach(notification => {
      if (notification.user_id === userId && !notification.read) {
        notification.read = true;
        markedCount++;
      }
    });
    
    writeDB(db);
    res.json({ success: true, markedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 標記通知為已讀
app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  try {
    const db = readDB();
    const notificationId = parseInt(req.params.id);
    
    const notification = db.notifications.find(n => n.id === notificationId && n.user_id === req.user.userId);
    if (!notification) {
      return res.status(404).json({ error: '通知不存在' });
    }
    
    notification.read = true;
    writeDB(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取商品詳情
app.get('/api/products/:id', (req, res) => {
  try {
    const db = readDB();
    const product = db.products.find(p => p.id === parseInt(req.params.id));
    
    if (!product) return res.status(404).json({ error: '商品不存在' });
    
    const user = db.users.find(u => u.id === product.user_id);
    const likes_count = db.likes ? db.likes.filter(like => like.product_id === product.id).length : 0;
    
    res.json({ ...product, username: user ? user.username : 'Unknown', likes_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取用戶資料
app.get('/api/user/profile', authenticateToken, (req, res) => {
  try {
    const db = readDB();
    const user = db.users.find(u => u.id === req.user.userId);
    
    if (!user) return res.status(404).json({ error: '用戶不存在' });
    
    // 不返回密碼
    const { password, ...userProfile } = user;
    res.json(userProfile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 頭像上傳功能
// const multer = require('multer');
// const upload = multer({ dest: 'uploads/temp/' });

app.post('/api/upload-avatar', authenticateToken, upload.single('avatar'), (req, res) => {
  console.log('收到頭像上傳請求');
  try {
    if (!req.file) {
      return res.status(400).json({ error: '沒有上傳文件' });
    }

    const userId = req.user.userId;
    const avatarUrl = `/uploads/${req.file.filename}`;
    
    // 更新JSON資料庫中的用戶頭像URL
    const db = readDB();
    const userIndex = db.users.findIndex(u => u.id === userId);
    
    if (userIndex === -1) {
      return res.status(404).json({ error: '用戶不存在' });
    }
    
    db.users[userIndex].avatar_url = avatarUrl;
    writeDB(db);
    
    console.log('頭像上傳成功，用戶ID:', userId, '頭像URL:', avatarUrl);
    res.json({ 
      success: true, 
      message: '頭像上傳成功',
      avatarUrl: avatarUrl
    });
  } catch (error) {
    console.error('頭像上傳錯誤:', error);
    res.status(500).json({ error: error.message });
  }
});

// 獲取用戶資訊
app.get('/api/users/:userId', authenticateToken, (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: '用戶不存在' });
    }
    
    // 只返回公開資訊
    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      avatar_url: user.avatar_url
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 獲取用戶頭像
app.get('/api/users/:userId/avatar', (req, res) => {
  const userId = parseInt(req.params.userId);
  
  try {
    const db = readDB();
    const user = db.users.find(u => u.id === userId);
    
    if (!user) {
      return res.status(404).json({ error: '用戶不存在' });
    }
    
    res.json({ avatar_url: user.avatar_url || null });
  } catch (error) {
    console.error('獲取用戶頭像失敗:', error);
    res.status(500).json({ error: '獲取頭像失敗' });
  }
});

// ===== 私人訊息 API =====

// 創建或獲取對話
app.post('/api/conversations', authenticateToken, (req, res) => {
  const { other_user_id, product_id, product_title, initial_message } = req.body;
  const data = readDB();
  
  // 驗證other_user_id
  if (!other_user_id) {
    return res.status(400).json({ error: '缺少對方用戶ID' });
  }
  
  // 確保不是和自己對話
  if (other_user_id === req.user.userId) {
    return res.status(400).json({ error: '不能和自己對話' });
  }
  
  // 如果有商品ID，查找該商品的專屬對話
  let existing;
  if (product_id) {
    existing = data.conversations.find(c => 
      ((c.user1Id === req.user.userId && c.user2Id === other_user_id) ||
       (c.user1Id === other_user_id && c.user2Id === req.user.userId)) &&
      c.product_id === product_id
    );
  } else {
    existing = data.conversations.find(c => 
      (c.user1Id === req.user.userId && c.user2Id === other_user_id) ||
      (c.user1Id === other_user_id && c.user2Id === req.user.userId)
    );
  }
  
  if (existing) {
    // 如果有初始訊息，發送它
    if (initial_message) {
      if (!data.messages) data.messages = [];
      if (!data.nextMessageId) data.nextMessageId = 1;
      
      data.messages.push({
        id: data.nextMessageId++,
        conversationId: existing.id,
        senderId: req.user.userId,
        content: initial_message,
        timestamp: new Date().toISOString(),
        read: false
      });
      writeDB(data);
    }
    return res.json(existing);
  }
  
  const conversation = {
    id: data.nextConversationId++,
    user1Id: req.user.userId,
    user2Id: other_user_id,
    product_id: product_id || null,
    product_title: product_title || null,
    createdAt: new Date().toISOString()
  };
  
  data.conversations.push(conversation);
  
  // 發送初始訊息
  if (initial_message) {
    if (!data.messages) data.messages = [];
    if (!data.nextMessageId) data.nextMessageId = 1;
    
    data.messages.push({
      id: data.nextMessageId++,
      conversationId: conversation.id,
      senderId: req.user.userId,
      content: initial_message,
      timestamp: new Date().toISOString(),
      read: false
    });
  }
  
  writeDB(data);
  res.json(conversation);
});

// 發送私人訊息
app.post('/api/conversations/:conversationId/messages', authenticateToken, (req, res) => {
  const { content } = req.body;
  const conversationId = parseInt(req.params.conversationId);
  const data = readDB();
  
  const conversation = data.conversations.find(c => c.id === conversationId);
  if (!conversation || (conversation.user1Id !== req.user.userId && conversation.user2Id !== req.user.userId)) {
    return res.status(403).json({ error: '無權限' });
  }
  
  const message = {
    id: data.nextMessageId++,
    conversationId,
    senderId: req.user.userId,
    content: content.trim(),
    timestamp: new Date().toISOString(),
    read: false
  };
  
  data.messages.push(message);
  
  // 創建通知給對方
  if (!data.notifications) data.notifications = [];
  if (!data.nextNotificationId) data.nextNotificationId = 1;
  
  const receiverId = conversation.user1Id === req.user.userId ? conversation.user2Id : conversation.user1Id;
  const senderUser = data.users.find(u => u.id === req.user.userId);
  
  const notification = {
    id: data.nextNotificationId++,
    user_id: receiverId,
    type: 'private_message',
    content: `${senderUser?.username || '用戶'} 發送了私人訊息：${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
    conversation_id: conversationId,
    sender_id: req.user.userId,
    sender_name: senderUser?.username || '用戶',
    is_read: false,
    created_at: new Date().toISOString()
  };
  
  data.notifications.push(notification);
  writeDB(data);
  res.json(message);
});

// 獲取對話訊息
app.get('/api/conversations/:conversationId/messages', authenticateToken, (req, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const data = readDB();
  
  const conversation = data.conversations.find(c => c.id === conversationId);
  if (!conversation || (conversation.user1Id !== req.user.userId && conversation.user2Id !== req.user.userId)) {
    return res.status(403).json({ error: '無權限' });
  }
  
  const messages = data.messages
    .filter(m => m.conversationId === conversationId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
  res.json(messages);
});

// 標記對話中的訊息為已讀
app.put('/api/conversations/:conversationId/read', authenticateToken, (req, res) => {
  const conversationId = parseInt(req.params.conversationId);
  const data = readDB();
  
  const conversation = data.conversations.find(c => c.id === conversationId);
  if (!conversation || (conversation.user1Id !== req.user.userId && conversation.user2Id !== req.user.userId)) {
    return res.status(403).json({ error: '無權限' });
  }
  
  // 標記所有不是當前用戶發送的訊息為已讀
  data.messages
    .filter(m => m.conversationId === conversationId && m.senderId !== req.user.userId)
    .forEach(m => m.read = true);
  
  // 同時標記相關的私訊通知為已讀
  data.notifications
    .filter(n => n.user_id === req.user.userId && n.type === 'private_message' && n.conversation_id === conversationId)
    .forEach(n => {
      n.read = true;
      n.is_read = true;
    });
  
  writeDB(data);
  res.json({ success: true });
});

// 獲取對話列表
app.get('/api/conversations', authenticateToken, (req, res) => {
  const data = readDB();
  const userId = req.user.userId;
  
  // 獲取用戶參與的所有對話（排除與自己的對話和無效對話）
  const userConversations = data.conversations.filter(c => 
    c.user1Id && c.user2Id && // 確保兩個用戶ID都存在
    (c.user1Id === userId || c.user2Id === userId) && 
    c.user1Id !== c.user2Id // 排除自己和自己的對話
  );
  
  // 為每個對話獲取最新訊息和未讀數量
  const conversationsWithDetails = userConversations.map(conversation => {
    const messages = data.messages.filter(m => m.conversationId === conversation.id);
    const allMessages = messages.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // 找對方最新的訊息作為預覽
    const latestMessageFromOther = allMessages.find(m => m.senderId !== userId);
    // 找所有訊息中的最新訊息用於排序
    const latestMessage = allMessages[0];
    const unreadCount = messages.filter(m => m.senderId !== userId && !m.read).length;
    
    // 獲取對方用戶信息
    const otherUserId = conversation.user1Id === userId ? conversation.user2Id : conversation.user1Id;
    const otherUser = data.users.find(u => u.id === otherUserId);
    
    return {
      id: conversation.id,
      product_title: conversation.product_title,
      otherUser: {
        id: otherUserId,
        username: otherUser ? otherUser.username : '未知用戶',
        avatar: otherUser ? otherUser.avatar_url : null
      },
      latestMessage: latestMessage ? {
        content: latestMessage.content,
        createdAt: latestMessage.timestamp,
        senderId: latestMessage.senderId
      } : null,
      unreadCount,
      updatedAt: latestMessage ? latestMessage.timestamp : conversation.createdAt
    };
  });
  
  // 按最新訊息時間排序
  conversationsWithDetails.sort((a, b) => 
    new Date(b.updatedAt) - new Date(a.updatedAt)
  );
  
  res.json(conversationsWithDetails);
});

// 搜尋用戶
app.get('/api/users/search', authenticateToken, (req, res) => {
  const { q } = req.query;
  const data = readDB();
  
  if (!q || q.length < 2) return res.json([]);
  
  const users = data.users
    .filter(u => u.username.toLowerCase().includes(q.toLowerCase()) && u.id !== req.user.userId)
    .slice(0, 10)
    .map(u => ({ id: u.id, username: u.username }));
  
  res.json(users);
});

app.listen(PORT, () => {
  console.log(`伺服器運行在 http://localhost:${PORT}`);
});
