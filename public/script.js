let currentUser = null;
let products = [];

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadProducts();
    setupEventListeners();
});

// 檢查用戶登入狀態
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (token && user) {
        currentUser = JSON.parse(user);
        updateNavigation(true);
    }
}

// 更新導航欄
function updateNavigation(isLoggedIn) {
    const authLink = document.getElementById('auth-link');
    const logoutLink = document.getElementById('logout-link');
    const addProductLink = document.getElementById('add-product-link');
    const profileLink = document.getElementById('profile-link');
    
    if (isLoggedIn) {
        authLink.style.display = 'none';
        logoutLink.style.display = 'inline';
        addProductLink.style.display = 'inline';
        profileLink.style.display = 'inline';
    } else {
        authLink.style.display = 'inline';
        logoutLink.style.display = 'none';
        addProductLink.style.display = 'none';
        profileLink.style.display = 'none';
    }
}

// 設置事件監聽器
function setupEventListeners() {
    // 登入表單
    document.getElementById('login-form').addEventListener('submit', handleLogin);
    
    // 註冊表單
    document.getElementById('register-form').addEventListener('submit', handleRegister);
    
    // 商品發布表單
    document.getElementById('product-form').addEventListener('submit', handleAddProduct);
    
    // 商品編輯表單
    document.getElementById('edit-product-form').addEventListener('submit', handleEditProduct);
    
    // 叫價表單
    document.getElementById('bid-form').addEventListener('submit', handleBid);
    
    // 評論表單
    document.getElementById('comment-form').addEventListener('submit', handleComment);
    
    // 搜尋功能
    document.getElementById('search-input').addEventListener('input', filterProducts);
    document.getElementById('category-filter').addEventListener('change', filterProducts);
}

// 顯示指定區塊
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    if (sectionId === 'products') {
        loadProducts();
    }
}

// 切換登入/註冊標籤
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    
    event.target.classList.add('active');
    document.getElementById(tab + '-form').classList.add('active');
}

// 處理登入
async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        alert('請填寫完整資訊');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            currentUser = data.user;
            updateNavigation(true);
            showSection('home');
            alert('登入成功！');
            document.getElementById('login-form').reset();
        } else {
            alert(data.error || '登入失敗');
            console.error('Login error:', data);
        }
    } catch (error) {
        console.error('Login error:', error);
        alert('登入失敗，請檢查網路連線');
    }
}

// 處理註冊
async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, email, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('註冊成功！請登入');
            switchTab('login');
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('註冊失敗，請稍後再試');
    }
}

// 處理商品發布
async function handleAddProduct(e) {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('title', document.getElementById('product-title').value);
    formData.append('description', document.getElementById('product-description').value);
    formData.append('category', document.getElementById('product-category').value);
    formData.append('condition_desc', document.getElementById('product-condition').value);
    formData.append('price', document.getElementById('product-price').value);
    
    const imageFile = document.getElementById('product-image').files[0];
    if (imageFile) formData.append('image', imageFile);
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('商品發布成功！');
            document.getElementById('product-form').reset();
            showSection('products');
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('發布失敗，請稍後再試');
    }
}

// 載入商品列表
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        products = await response.json();
        displayProducts(products);
    } catch (error) {
        console.error('載入商品失敗:', error);
    }
}

// 顯示商品
function displayProducts(productsToShow) {
    const grid = document.getElementById('products-grid');
    
    if (productsToShow.length === 0) {
        grid.innerHTML = '<p>暫無商品</p>';
        return;
    }
    
    grid.innerHTML = productsToShow.map(product => `
        <div class="product-card" onclick="showProductDetail(${product.id})">
            ${product.image_url ? `<img src="${product.image_url}" alt="${product.title}" class="product-image">` : ''}
            <h3>${product.title}</h3>
            ${product.price > 0 ? `<div class="product-price">NT$ ${product.price}</div>` : ''}
            <p>${product.description}</p>
            <div class="product-meta">
                <span>分類: ${getCategoryName(product.category)}</span><br>
                <span>狀況: ${product.condition_desc}</span><br>
                <span>發布者: ${product.username}</span>
            </div>
        </div>
    `).join('');
}

// 獲取分類名稱
function getCategoryName(category) {
    const categories = {
        'electronics': '電子產品',
        'books': '書籍',
        'clothing': '服飾',
        'furniture': '家具',
        'others': '其他'
    };
    return categories[category] || category;
}

// 篩選商品
function filterProducts() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase();
    const categoryFilter = document.getElementById('category-filter').value;
    
    let filtered = products.filter(product => {
        const matchesSearch = product.title.toLowerCase().includes(searchTerm) ||
                            product.description.toLowerCase().includes(searchTerm);
        const matchesCategory = !categoryFilter || product.category === categoryFilter;
        
        return matchesSearch && matchesCategory;
    });
    
    displayProducts(filtered);
}

// 申請交換
async function requestExchange(productId) {
    if (!currentUser) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ productId })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            alert('交換請求已發送！');
        } else {
            alert(data.error);
        }
    } catch (error) {
        alert('請求失敗，請稍後再試');
    }
}

// 登出
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    currentUser = null;
    updateNavigation(false);
    showSection('home');
    alert('已登出');
}

// 顯示商品詳情
async function showProductDetail(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`);
        const product = await response.json();
        
        document.getElementById('product-info').innerHTML = `
            <div class="product-detail">
                ${product.image_url ? `<img src="${product.image_url}" alt="${product.title}" class="product-image">` : ''}
                <h2>${product.title}</h2>
                ${product.price > 0 ? `<div class="product-price">NT$ ${product.price}</div>` : ''}
                <p>${product.description}</p>
                <div class="product-meta">
                    <span>分類: ${getCategoryName(product.category)}</span><br>
                    <span>狀況: ${product.condition_desc}</span><br>
                    <span>發布者: ${product.username}</span>
                </div>
                ${currentUser && currentUser.id === product.user_id ? 
                    `<button class="btn-primary" onclick="showEditForm(${product.id})">編輯商品</button>
                     <button class="btn-secondary" onclick="showEditHistory(${product.id})">修改紀錄</button>` : 
                    currentUser && currentUser.id !== product.user_id ? 
                    `<button class="btn-exchange" onclick="requestExchange(${product.id})">申請交換</button>` : 
                    ''}
            </div>
        `;
        
        loadBids(productId);
        loadComments(productId);
        
        if (currentUser) {
            document.getElementById('bid-form').style.display = 'block';
            document.getElementById('comment-form').style.display = 'block';
            document.getElementById('bid-form').onsubmit = (e) => handleBid(e, productId);
            document.getElementById('comment-form').onsubmit = (e) => handleComment(e, productId);
        }
        
        showSection('product-detail');
    } catch (error) {
        alert('載入商品詳情失敗');
    }
}

// 載入叫價
async function loadBids(productId) {
    try {
        const response = await fetch(`/api/products/${productId}/bids`);
        const bids = await response.json();
        
        document.getElementById('bids-list').innerHTML = bids.map(bid => `
            <div class="bid-item">
                <div class="bid-amount">NT$ ${bid.amount}</div>
                <div class="bid-user">${bid.username}</div>
                ${bid.message ? `<div class="bid-message">${bid.message}</div>` : ''}
                <div class="bid-time">${new Date(bid.created_at).toLocaleString()}</div>
            </div>
        `).join('') || '<p>暫無叫價</p>';
    } catch (error) {
        console.error('載入叫價失敗:', error);
    }
}

// 載入評論
async function loadComments(productId) {
    try {
        const response = await fetch(`/api/products/${productId}/comments`);
        const comments = await response.json();
        
        document.getElementById('comments-list').innerHTML = comments.map(comment => `
            <div class="comment-item">
                <div class="comment-user">${comment.username}</div>
                <div class="comment-content">${comment.content}</div>
                <div class="comment-time">${new Date(comment.created_at).toLocaleString()}</div>
            </div>
        `).join('') || '<p>暫無評論</p>';
    } catch (error) {
        console.error('載入評論失敗:', error);
    }
}

// 處理叫價
async function handleBid(e, productId) {
    e.preventDefault();
    
    const amount = document.getElementById('bid-amount').value;
    const message = document.getElementById('bid-message').value;
    
    try {
        const response = await fetch(`/api/products/${productId}/bids`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ amount, message })
        });
        
        if (response.ok) {
            document.getElementById('bid-form').reset();
            loadBids(productId);
            alert('叫價成功！');
        }
    } catch (error) {
        alert('叫價失敗');
    }
}

// 處理評論
async function handleComment(e, productId) {
    e.preventDefault();
    
    const content = document.getElementById('comment-content').value;
    
    try {
        const response = await fetch(`/api/products/${productId}/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: JSON.stringify({ content })
        });
        
        if (response.ok) {
            document.getElementById('comment-form').reset();
            loadComments(productId);
            alert('評論發布成功！');
        }
    } catch (error) {
        alert('評論發布失敗');
    }
}
// 顯示編輯表單
async function showEditForm(productId) {
    try {
        const response = await fetch(`/api/products/${productId}`);
        const product = await response.json();
        
        document.getElementById('edit-title').value = product.title;
        document.getElementById('edit-description').value = product.description;
        document.getElementById('edit-category').value = product.category;
        document.getElementById('edit-condition').value = product.condition_desc;
        document.getElementById('edit-price').value = product.price;
        
        document.getElementById('edit-product').style.display = 'block';
        document.getElementById('edit-product-form').dataset.productId = productId;
    } catch (error) {
        alert('載入商品資料失敗');
    }
}

// 處理商品編輯
async function handleEditProduct(e) {
    e.preventDefault();
    
    const productId = e.target.dataset.productId;
    const formData = new FormData();
    
    formData.append('title', document.getElementById('edit-title').value);
    formData.append('description', document.getElementById('edit-description').value);
    formData.append('category', document.getElementById('edit-category').value);
    formData.append('condition_desc', document.getElementById('edit-condition').value);
    formData.append('price', document.getElementById('edit-price').value);
    
    const imageFile = document.getElementById('edit-image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('商品修改成功');
            document.getElementById('edit-product').style.display = 'none';
            showProductDetail(productId);
        } else {
            alert(result.error || '修改失敗');
        }
    } catch (error) {
        alert('修改失敗');
    }
}

// 取消編輯
function cancelEdit() {
    document.getElementById('edit-product').style.display = 'none';
}

// 顯示修改紀錄
async function showEditHistory(productId) {
    try {
        const response = await fetch(`/api/products/${productId}/edits`);
        const edits = await response.json();
        
        const fieldNames = {
            'title': '商品名稱',
            'description': '商品描述',
            'category': '分類',
            'condition_desc': '物品狀況',
            'price': '價格',
            'image_url': '商品圖片'
        };
        
        document.getElementById('edits-list').innerHTML = edits.length > 0 ? 
            edits.map(edit => `
                <div class="edit-record">
                    <div class="field">${fieldNames[edit.field_name] || edit.field_name}</div>
                    <div class="change">
                        <span class="old-value">${edit.old_value || '無'}</span> → 
                        <span class="new-value">${edit.new_value}</span>
                    </div>
                    <div class="timestamp">${new Date(edit.edited_at).toLocaleString()}</div>
                </div>
            `).join('') : '<p>暫無修改紀錄</p>';
        
        document.getElementById('edit-history').style.display = 'block';
    } catch (error) {
        alert('載入修改紀錄失敗');
    }
}
