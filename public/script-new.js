let currentUser = null;
let currentToken = null;

// 分類名稱映射
function getCategoryName(category) {
    const categoryMap = {
        'electronics': '電子產品',
        'books': '書籍',
        'clothing': '服飾',
        'furniture': '家具',
        'others': '其他'
    };
    return categoryMap[category] || category;
}

// 初始化
document.addEventListener('DOMContentLoaded', async function() {
    await checkAuth();
    loadProducts();
    setupSearch();
});



// 顯示登入狀態
function showLoggedInState() {
    document.getElementById('auth-link').style.display = 'none';
    document.getElementById('logout-link').style.display = 'none';
    document.getElementById('add-product-link').style.display = 'inline';
    document.getElementById('profile-icon').style.display = 'block';
    
    // 載入用戶頭像
    loadUserAvatar();
    updateCartCount();
}

// 顯示通知回覆表單
function showNotificationReply(notificationId) {
    const form = document.getElementById(`notification-reply-${notificationId}`);
    if (form) {
        form.style.display = 'block';
        document.getElementById(`notification-reply-input-${notificationId}`).focus();
    }
}

// 隱藏通知回覆表單
function hideNotificationReply(notificationId) {
    const form = document.getElementById(`notification-reply-${notificationId}`);
    if (form) {
        form.style.display = 'none';
        document.getElementById(`notification-reply-input-${notificationId}`).value = '';
    }
}

// 提交通知回覆
async function submitNotificationReply(notificationId) {
    event.preventDefault(); // 阻止默認行為
    event.stopPropagation(); // 阻止事件冒泡
    
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const content = document.getElementById(`notification-reply-input-${notificationId}`).value.trim();
    if (!content) {
        alert('請輸入回覆內容');
        return;
    }
    
    try {
        // 先獲取通知詳情
        const notificationResponse = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!notificationResponse.ok) {
            throw new Error('無法獲取通知');
        }
        
        const notifications = await notificationResponse.json();
        const notification = notifications.find(n => n.id === notificationId);
        
        if (!notification) {
            alert('通知不存在');
            return;
        }
        
        // 提交回覆
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                product_id: notification.product_id,
                content: content,
                parent_id: notification.comment_id || notification.parent_comment_id
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            hideNotificationReply(notificationId);
            
            // 自動標記通知為已讀並更新徽章
            await markAsRead(notificationId);
            await updateNotificationCount();
            
            loadNotifications(); // 重新載入通知
            // 如果當前在商品詳情頁，重新載入評論
            if (currentProductId) {
                loadComments(currentProductId);
            }
            alert('回覆成功！');
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('回覆失敗:', error);
        alert('回覆失敗');
    }
}

// 顯示登出狀態
function showLoggedOutState() {
    document.getElementById('auth-link').style.display = 'inline';
    document.getElementById('logout-link').style.display = 'none';
    document.getElementById('add-product-link').style.display = 'none';
    document.getElementById('profile-icon').style.display = 'none';
    document.getElementById('cart-count').style.display = 'none';
}

// 切換頁面
function showSection(sectionName) {
    // 移除所有 active 類別
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // 顯示選中的頁面
    document.getElementById(sectionName).classList.add('active');
    
    // 更新導航狀態
    const activeLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // 載入對應內容
    switch(sectionName) {
        case 'products':
            loadProducts();
            break;
        case 'profile':
            // 確保完整載入個人中心
            if (currentToken) {
                loadProfile();
            }
            break;
        case 'add-product':
            setupAddProductForm();
            break;
    }
    
    // 關閉選單
    closeProfileMenu();
}

// 切換購物車
function toggleCart() {
    const cartSidebar = document.getElementById('cart-sidebar');
    cartSidebar.classList.toggle('open');
    
    if (cartSidebar.classList.contains('open')) {
        loadCartItems();
    }
}

// 載入購物車項目（收藏商品）
async function loadCartItems() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/user/cart', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) return;
        
        const cartItems = await response.json();
        const cartContainer = document.getElementById('cart-items');
        
        if (cartItems.length === 0) {
            cartContainer.innerHTML = '<p class="empty-cart">您的購物車是空的</p>';
            updateCartTotal(0);
            return;
        }
        
        cartContainer.innerHTML = cartItems.map(product => `
            <div class="cart-item">
                <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}" onclick="viewProductDetails(${product.id})">
                <div class="cart-item-info">
                    <h4 onclick="viewProductDetails(${product.id})">${product.title}</h4>
                    <p class="cart-item-price">$${product.price || '面議'}</p>
                    <div class="cart-item-actions">
                        <button class="btn-view" onclick="viewProductDetails(${product.id})">查看詳情</button>
                        <button class="btn-remove" onclick="removeFromCart(${product.id})">移除</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // 計算總價
        const total = cartItems.reduce((sum, product) => {
            const price = parseFloat(product.price) || 0;
            return sum + price;
        }, 0);
        
        updateCartTotal(total);
        
    } catch (error) {
        console.error('載入購物車失敗:', error);
    }
}

// 更新購物車數量
async function updateCartCount() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/user/cart', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) return;
        
        const cartItems = await response.json();
        const cartCount = document.getElementById('cart-count');
        
        if (cartItems.length > 0) {
            cartCount.textContent = cartItems.length;
            cartCount.style.display = 'flex';
        } else {
            cartCount.style.display = 'none';
        }
        
    } catch (error) {
        console.error('更新購物車數量失敗:', error);
    }
}

// 切換個人資料選單
function toggleProfileMenu() {
    const menu = document.getElementById('profile-menu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
}

// 關閉個人資料選單
function closeProfileMenu() {
    const menu = document.getElementById('profile-menu');
    if (menu) menu.style.display = 'none';
}

// 顯示頭像上傳
function showAvatarUpload() {
    const modal = document.getElementById('avatar-modal');
    if (modal) modal.style.display = 'flex';
    closeProfileMenu();
}

// 關閉頭像上傳視窗
function closeAvatarModal() {
    document.getElementById('avatar-modal').style.display = 'none';
}

// 預覽頭像
function previewAvatar(event) {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('avatar-preview-img');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

// 上傳頭像
async function uploadAvatar() {
    const fileInput = document.getElementById('avatar-upload');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('請選擇頭像圖片');
        return;
    }
    
    if (!currentUser) {
        alert('請先登入');
        return;
    }
    
    // 暫時使用本地預覽作為頭像
    const reader = new FileReader();
    reader.onload = function(e) {
        const avatar = document.getElementById('user-avatar');
        if (avatar) {
            avatar.src = e.target.result;
        }
        
        // 使用用戶ID儲存頭像，避免不同用戶共享
        const avatarKey = `userAvatar_${currentUser.id}`;
        localStorage.setItem(avatarKey, e.target.result);
        
        alert('頭像已更新！');
        closeAvatarModal();
    };
    reader.readAsDataURL(file);
}

// 載入用戶頭像 - 已移至後面統一處理

// 個人中心標籤切換
function showProfileTab(tabName) {
    // 更新標籤樣式
    document.querySelectorAll('.profile-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // 找到對應的標籤按鈕
    const targetTab = Array.from(document.querySelectorAll('.profile-tab')).find(tab => 
        tab.onclick && tab.onclick.toString().includes(tabName)
    );
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    // 顯示對應內容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const targetContent = document.getElementById(`${tabName}-tab`);
    if (targetContent) {
        targetContent.classList.add('active');
    }
    
    // 載入對應資料
    switch(tabName) {
        case 'products':
            loadUserProducts();
            break;
        case 'favorites':
            loadUserFavorites();
            break;
        case 'exchanges':
            loadUserExchanges();
            break;
    }
}

// 載入用戶收藏
async function loadUserFavorites() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/user/favorites', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) return;
        
        const favorites = await response.json();
        const container = document.getElementById('user-favorites');
        
        if (favorites.length === 0) {
            container.innerHTML = '<p>暫無收藏商品</p>';
            return;
        }
        
        container.innerHTML = favorites.map(product => `
            <div class="product-card" data-product-id="${product.id}" onclick="showProductDetail(${product.id})">
                <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}">
                <div class="product-info">
                    <h3>${product.title}</h3>
                    <p>${product.description}</p>
                    <div class="product-meta">
                        <span>${getCategoryName(product.category)}</span>
                        <span>${product.condition_desc || '狀況未知'}</span>
                    </div>
                    <div class="product-actions">
                        <span class="likes">❤️ ${product.likes_count || 0}</span>
                        <span class="user">by ${product.username}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('載入收藏失敗:', error);
    }
}

// 載入用戶商品
async function loadUserProducts() {
    console.log('DEBUG: 開始載入用戶商品...');
    
    if (!currentToken) {
        console.log('DEBUG: 沒有token，無法載入商品');
        return;
    }
    
    try {
        const response = await fetch('/api/user/products', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        console.log('DEBUG: API回應狀態:', response.status);
        
        if (!response.ok) {
            console.log('DEBUG: API回應失敗');
            return;
        }
        
        const products = await response.json();
        console.log('DEBUG: 獲取到商品數量:', products.length);
        
        const container = document.getElementById('user-products');
        console.log('DEBUG: 容器元素:', container);
        
        if (!container) {
            console.log('DEBUG: 找不到user-products容器！');
            return;
        }
        
        if (products.length === 0) {
            container.innerHTML = '<p>暫無發布商品</p>';
            console.log('DEBUG: 顯示無商品訊息');
            return;
        }
        
        container.innerHTML = products.map(product => `
            <div class="product-card" data-product-id="${product.id}" onclick="showProductDetail(${product.id})">
                <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}">
                <div class="product-info">
                    <h3>${product.title}</h3>
                    <p>${product.description}</p>
                    <div class="product-meta">
                        <span>${product.category}</span>
                        <span>${product.condition_desc || '狀況未知'}</span>
                        ${product.is_sold ? '<span class="sold-badge">已售出</span>' : ''}
                    </div>
                    <div class="product-actions">
                        <span class="likes">❤️ ${product.likes_count || 0}</span>
                        <span class="price">$${product.price || '面議'}</span>
                    </div>
                </div>
            </div>
        `).join('');
        
        console.log('DEBUG: 商品已渲染到頁面');
        
    } catch (error) {
        console.error('DEBUG: 載入商品失敗:', error);
    }
}

// 載入交換記錄
async function loadUserExchanges() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/user/exchanges', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) return;
        
        const exchanges = await response.json();
        const container = document.getElementById('user-exchanges');
        
        if (exchanges.length === 0) {
            container.innerHTML = '<p>暫無交換記錄</p>';
            return;
        }
        
        container.innerHTML = exchanges.map(exchange => `
            <div class="exchange-item">
                <div class="exchange-header">
                    <h4>${exchange.product_title}</h4>
                    <span class="exchange-status ${exchange.status}">${getStatusText(exchange.status)}</span>
                </div>
                <p>與 ${exchange.other_user} 的交換</p>
                <small>${new Date(exchange.created_at).toLocaleString()}</small>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('載入交換記錄失敗:', error);
    }
}

// 獲取狀態文字
function getStatusText(status) {
    const statusMap = {
        'pending': '等待中',
        'completed': '已完成',
        'cancelled': '已取消'
    };
    return statusMap[status] || status;
}

// 收藏功能（更新購物車數量）
async function toggleFavorite(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        alert(result.message);
        
        // 更新購物車數量
        updateCartCount();
        
    } catch (error) {
        console.error('收藏失敗:', error);
    }
}

// 切換頁面
function showSection(sectionName) {
    // 移除所有 active 類別
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // 顯示選中的頁面
    document.getElementById(sectionName).classList.add('active');
    
    // 更新導航狀態
    const activeLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // 載入對應內容
    switch(sectionName) {
        case 'home':
        case 'shop':
            loadProducts();
            break;
        case 'profile':
            // 確保完整載入個人中心
            if (currentToken) {
                loadProfile();
            }
            break;
        case 'add-product':
            setupAddProductForm();
            break;
    }
}

// 載入商品
async function loadProducts() {
    try {
        const response = await fetch('/api/products');
        const products = await response.json();
        
        // 分離可購買和已售出的商品
        const availableProducts = products.filter(product => !product.is_sold);
        const soldProducts = products.filter(product => product.is_sold);
        
        displayProducts(availableProducts);
        displaySoldProducts(soldProducts);
    } catch (error) {
        console.error('載入商品失敗:', error);
    }
}

// 顯示商品
function displayProducts(products) {
    const grid = document.getElementById('products-grid');
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="no-products">暫無可購買商品</p>';
        return;
    }
    
    grid.innerHTML = products.map(product => `
        <div class="product-card ${product.status === 'processing' ? 'processing' : ''}" data-product-id="${product.id}" onclick="showProductDetail(${product.id})">
            <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}">
            <div class="product-info">
                <h3>${product.title}</h3>
                <div class="product-price">
                    ${product.price ? `$${product.price}` : '免費交換'}
                    ${product.status === 'processing' ? '<span class="status-badge processing">處理中</span>' : ''}
                </div>
                <p>${product.description}</p>
                <div class="product-meta">
                    <span>${getCategoryName(product.category)}</span>
                    <span>${product.condition_desc || '狀況未知'}</span>
                </div>
                <div class="product-actions">
                    <div class="action-buttons">
                        <button class="btn-heart" onclick="event.stopPropagation(); toggleLike(${product.id})" title="按讚">
                            ❤️ ${product.likes_count || 0}
                        </button>
                        ${currentUser && currentUser.id && product.user_id === currentUser.id && !product.is_sold ? `
                            <button class="btn-edit" onclick="event.stopPropagation(); editProduct(${product.id})" title="編輯商品">
                                ✏️
                            </button>
                            <button class="btn-history" onclick="event.stopPropagation(); viewEditHistory(${product.id})" title="編輯歷史">
                                📋
                            </button>
                            <button class="btn-delete" onclick="event.stopPropagation(); deleteProduct(${product.id})" title="刪除商品">
                                🗑️
                            </button>
                        ` : currentUser && currentUser.id && product.user_id === currentUser.id && product.is_sold ? `
                            <button class="btn-sold-info" disabled title="商品已售出，無法編輯">
                                ✅ 已售出
                            </button>
                            <button class="btn-history" onclick="event.stopPropagation(); viewEditHistory(${product.id})" title="編輯歷史">
                                📋
                            </button>
                        ` : ''}
                    </div>
                    <span class="user">by ${product.username}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// 顯示已售出商品
function displaySoldProducts(products) {
    const grid = document.getElementById('sold-products-grid');
    if (!grid) return;
    
    if (products.length === 0) {
        grid.innerHTML = '<p class="no-products">暫無已售出商品</p>';
        return;
    }
    
    grid.innerHTML = products.map(product => `
        <div class="product-card sold-product" data-product-id="${product.id}" onclick="showProductDetail(${product.id})">
            <div class="sold-overlay">✅ 已售出</div>
            <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}">
            <div class="product-info">
                <h3>${product.title}</h3>
                <div class="product-price">${product.price ? `$${product.price}` : '免費交換'}</div>
                <p>${product.description}</p>
                <div class="product-meta">
                    <span>${getCategoryName(product.category)}</span>
                    <span>已完成交易</span>
                </div>
                <div class="product-actions">
                    <div class="action-buttons">
                        <button class="btn-heart" onclick="event.stopPropagation(); toggleLike(${product.id})" title="按讚">
                            ❤️ ${product.likes_count || 0}
                        </button>
                    </div>
                    <span class="user">by ${product.username}</span>
                    ${product.sold_at ? `<span class="sold-date">售出: ${new Date(product.sold_at).toLocaleDateString()}</span>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

// 載入用戶大頭貼緩存
async function loadUserAvatarCache() {
    try {
        const response = await fetch('/api/users/avatars');
        if (response.ok) {
            const avatars = await response.json();
            window.userAvatarCache = {};
            avatars.forEach(user => {
                window.userAvatarCache[user.id] = user.avatar_url || 'default';
            });
        }
    } catch (error) {
        console.warn('載入用戶大頭貼失敗:', error);
        window.userAvatarCache = {};
    }
}

// 顯示嵌套留言（增強版）
async function displayNestedComments(comments) {
    if (!comments || comments.length === 0) {
        return '<p>暫無留言</p>';
    }
    
    // 分離主留言和回覆，並按時間排序（最新在前）
    const mainComments = comments.filter(c => !c.parent_id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const replies = comments.filter(c => c.parent_id)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    const commentsHtml = [];
    
    for (const comment of mainComments) {
        // 獲取所有相關的回覆（包括對回覆的回覆）
        const getAllReplies = (parentId) => {
            const directReplies = replies.filter(r => r.parent_id === parentId);
            let allReplies = [...directReplies];
            
            // 遞歸獲取回覆的回覆
            for (const reply of directReplies) {
                allReplies = allReplies.concat(getAllReplies(reply.id));
            }
            
            return allReplies;
        };
        
        const commentReplies = getAllReplies(comment.id);
        const commentAvatar = await getUserAvatar(comment.user_id, comment.username);
        
        let repliesHtml = '';
        if (commentReplies.length > 0) {
            const replyItems = [];
            for (const reply of commentReplies) {
                const replyAvatar = await getUserAvatar(reply.user_id, reply.username);
                
                // 找到被回覆的對象
                const parentComment = reply.parent_id === comment.id ? 
                    comment : 
                    replies.find(r => r.id === reply.parent_id);
                const replyToName = parentComment ? parentComment.username : comment.username;
                
                replyItems.push(`
                    <div class="comment reply-level-1">
                        <div class="comment-header">
                            <div class="comment-user-info">
                                <div class="comment-avatar">
                                    ${replyAvatar}
                                </div>
                                <div class="comment-user-details">
                                    <strong class="comment-username">${reply.username}</strong>
                                    <span class="reply-indicator">回覆 ${replyToName}</span>
                                    <span class="comment-time">${new Date(reply.created_at).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                        <div class="comment-content">
                            <p>${processContent(reply.content)}</p>
                            <div class="comment-actions">
                                <button onclick="showReplyForm(${reply.id})" class="btn-reply">回覆</button>
                            </div>
                        </div>
                        <div class="reply-form" id="reply-form-${reply.id}" style="display: none;">
                            <textarea id="reply-input-${reply.id}" placeholder="@${reply.username} "></textarea>
                            <div class="form-actions">
                                <button type="button" onclick="event.stopPropagation(); showEmojiPicker('reply-input-${reply.id}')">😀</button>
                                <button type="button" onclick="event.stopPropagation(); submitReply(${reply.id})" class="btn-primary">發送回覆</button>
                                <button type="button" onclick="event.stopPropagation(); hideReplyForm(${reply.id})" class="btn-secondary">取消</button>
                            </div>
                        </div>
                    </div>
                `);
            }
            
            repliesHtml = `
                <div class="comment-thread">
                    <div class="replies-header">
                        <span class="replies-count">${commentReplies.length} 則回覆</span>
                    </div>
                    ${replyItems.join('')}
                </div>
            `;
        }
        
        commentsHtml.push(`
            <div class="comment main-comment" data-comment-id="${comment.id}">
                <div class="comment-header">
                    <div class="comment-user-info">
                        <div class="comment-avatar">
                            ${commentAvatar}
                        </div>
                        <div class="comment-user-details">
                            <strong class="comment-username">${comment.username}</strong>
                            <span class="comment-time">${new Date(comment.created_at).toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                <div class="comment-content">
                    <p>${processContent(comment.content)}</p>
                </div>
                ${currentUser ? `
                    <div class="comment-actions">
                        <button class="btn-reply" onclick="showReplyForm(${comment.id})">
                            💬 回覆 ${comment.username}
                        </button>
                        <button class="btn-private-chat" onclick="startPrivateChat(${comment.user_id}, event)">>
                            📩 私訊
                        </button>
                    </div>
                    <div class="reply-form" id="reply-form-${comment.id}" style="display: none;">
                        <div class="reply-form-header">
                            <span>回覆給 <strong>${comment.username}</strong>：</span>
                        </div>
                        <textarea id="reply-input-${comment.id}" placeholder="@${comment.username} "></textarea>
                        <div class="form-actions">
                            <button onclick="showEmojiPicker('reply-input-${comment.id}')">😀</button>
                            <button onclick="submitReply(${comment.id})" class="btn-primary">發送回覆</button>
                            <button onclick="hideReplyForm(${comment.id})" class="btn-secondary">取消</button>
                        </div>
                    </div>
                ` : ''}
                ${repliesHtml}
            </div>
        `);
    }
    
    return commentsHtml.join('');
}

// 獲取用戶大頭貼 (簡化版本)
async function getUserAvatar(userId, username) {
    // 如果是當前用戶，使用當前用戶的頭像
    if (currentUser && currentUser.id == userId) {
        const currentAvatar = document.getElementById('user-avatar');
        if (currentAvatar && currentAvatar.src && !currentAvatar.src.includes('svg')) {
            return `<img src="${currentAvatar.src}" alt="${userId}" class="user-avatar-small">`;
        }
    }
    
    // 統一邏輯：先檢查 localStorage，再檢查後端
    const avatarKey = `userAvatar_${userId}`;
    const savedAvatar = localStorage.getItem(avatarKey);
    
    if (savedAvatar) {
        return `<img src="${savedAvatar}" alt="${userId}" class="user-avatar-small">`;
    }
    
    // 嘗試從後端獲取
    try {
        const response = await fetch(`/api/users/${userId}/avatar`);
        if (response.ok) {
            const result = await response.json();
            if (result.avatar_url) {
                return `<img src="${result.avatar_url}" alt="${userId}" class="user-avatar-small">`;
            }
        }
    } catch (error) {
        console.warn(`無法載入用戶 ${userId} 的大頭貼`);
    }
    
    // 默認頭像
    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
    const colorIndex = username ? username.charCodeAt(0) % colors.length : 0;
    const bgColor = colors[colorIndex];
    const initial = username ? username.charAt(0).toUpperCase() : '?';
    
    return `
        <div class="user-avatar-small default-avatar" style="background-color: ${bgColor}">
            ${initial}
        </div>
    `;
}

// 確保大頭貼已載入
async function ensureAvatarLoaded() {
    if (!currentUser || !currentToken) return;
    
    const panelAvatar = document.getElementById('panel-user-avatar');
    if (!panelAvatar || panelAvatar.src.includes('data:image/svg+xml')) {
        await loadUserAvatar();
    }
}

// 顯示回覆表單
function showReplyForm(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = 'block';
        document.getElementById(`reply-input-${commentId}`).focus();
    }
}

// 隱藏回覆表單
function hideReplyForm(commentId) {
    const form = document.getElementById(`reply-form-${commentId}`);
    if (form) {
        form.style.display = 'none';
        document.getElementById(`reply-input-${commentId}`).value = '';
    }
}

// 提交回覆
async function submitReply(parentId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const content = document.getElementById(`reply-input-${parentId}`).value.trim();
    if (!content) {
        alert('請輸入回覆內容');
        return;
    }
    
    // 從當前頁面獲取 productId
    const productDetailContainer = document.querySelector('.product-detail-container');
    if (!productDetailContainer) {
        alert('無法獲取商品信息');
        return;
    }
    
    // 從頁面中提取 productId（這裡需要一個更好的方法）
    const productId = window.currentProductId;
    if (!productId) {
        alert('無法獲取商品ID');
        return;
    }
    
    try {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                product_id: productId,
                content: content,
                parent_id: parentId
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            hideReplyForm(parentId);
            showProductDetail(productId); // 重新載入
            alert('回覆成功！');
            
            // 自動更新通知數量（可能有新的回覆通知）
            await updateNotificationCount();
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('回覆失敗:', error);
        alert('回覆失敗');
    }
}

// 顯示商品詳情
async function showProductDetail(productId) {
    // 保存當前商品ID供回覆功能使用
    window.currentProductId = productId;
    
    try {
        const response = await fetch(`/api/products/${productId}`);
        if (!response.ok) {
            throw new Error('商品不存在');
        }
        const product = await response.json();
        
        // 載入留言
        let comments = [];
        try {
            const commentsResponse = await fetch(`/api/comments/${productId}`);
            if (commentsResponse.ok) {
                comments = await commentsResponse.json();
            }
        } catch (error) {
            console.warn('載入留言失敗:', error);
        }
        
        const detailHtml = `
            <div class="product-detail-container">
                <div class="product-detail-header">
                    <div class="product-image-section">
                        <img src="${product.image_url || '/placeholder.jpg'}" alt="${product.title}" class="product-main-image">
                    </div>
                    
                    <div class="product-info-section">
                        <div class="product-title-row">
                            <h1>${product.title}</h1>
                            ${currentUser && currentUser.id && product.user_id === currentUser.id && !product.is_sold ? `
                                <button onclick="editProduct(${product.id})" class="btn-edit-icon" title="編輯商品">
                                    ✏️
                                </button>
                            ` : currentUser && currentUser.id && product.user_id === currentUser.id && product.is_sold ? `
                                <span class="sold-label" title="商品已售出，無法編輯">✅ 已售出</span>
                            ` : ''}
                        </div>
                        
                        <div class="product-price-box">
                            <span class="price-label">$</span>
                            <span class="price-amount">${product.price || 0}</span>
                        </div>
                        
                        <div class="product-description">
                            <p>${product.description}</p>
                        </div>
                        
                        <div class="product-details-table">
                            <h3>商品詳情</h3>
                            <table class="details-table">
                                <tr>
                                    <td class="detail-label">分類:</td>
                                    <td class="detail-value">${getCategoryName(product.category)}</td>
                                </tr>
                                <tr>
                                    <td class="detail-label">狀況:</td>
                                    <td class="detail-value">${product.condition_desc || '狀況未知'}</td>
                                </tr>
                                <tr>
                                    <td class="detail-label">數量:</td>
                                    <td class="detail-value">${product.quantity || 1}</td>
                                </tr>
                                <tr>
                                    <td class="detail-label">擁有者:</td>
                                    <td class="detail-value">${product.username}</td>
                                </tr>
                                <tr>
                                    <td class="detail-label">發布時間:</td>
                                    <td class="detail-value">${new Date(product.created_at).toLocaleDateString()}</td>
                                </tr>
                            </table>
                            
                            <div class="availability-status">
                                <span class="status-icon ${product.is_sold ? 'sold' : (product.status === 'processing' ? 'processing' : 'available')}">
                                    ${product.is_sold ? '❌' : (product.status === 'processing' ? '⏳' : '✅')}
                                </span>
                                <span class="status-text">${product.is_sold ? '已售出' : (product.status === 'processing' ? '處理中' : '可購買')}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="product-action-buttons">
                    ${currentUser ? `
                        <button onclick="toggleLike(${product.id})" class="btn-like-detail">
                            ❤️ 按讚 (${product.likes_count || 0})
                        </button>
                        <button onclick="addToCart(${product.id})" class="btn-cart-detail ${currentUser && currentUser.id && product.user_id === currentUser.id ? 'disabled' : ''}" 
                                ${currentUser && currentUser.id && product.user_id === currentUser.id ? 'disabled' : ''}>
                            🛒 加入購物車
                        </button>
                        <button onclick="${currentUser && currentUser.id && (product.user_id === currentUser.id || product.is_sold || product.status === 'processing') ? 'return false' : `confirmPurchase(${product.id})`}" 
                                class="btn-purchase-detail ${currentUser && currentUser.id && (product.user_id === currentUser.id || product.is_sold || product.status === 'processing') ? 'disabled' : ''}"
                                ${currentUser && currentUser.id && (product.user_id === currentUser.id || product.is_sold || product.status === 'processing') ? 'disabled' : ''}>
                            🔒 ${product.is_sold ? '已售出' : (product.status === 'processing' ? '處理中' : '確定購買')}
                        </button>
                    ` : `
                        <p class="login-prompt">請先登入以進行購買</p>
                    `}
                </div>
                
                <div class="comments-section" data-product-id="${productId}">
                    <h3>留言 (${comments.length})</h3>
                    
                    ${currentUser ? `
                        <div class="add-comment">
                            <textarea id="comment-input" placeholder="寫下你的留言..."></textarea>
                            <div class="form-actions">
                                <button onclick="showEmojiPicker('comment-input')">😀</button>
                                <button onclick="addComment(${product.id})" class="btn-primary">發送留言</button>
                            </div>
                        </div>
                    ` : ''}
                    
                    <div class="comments-list" id="comments-container">
                        載入留言中...
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('product-detail-content').innerHTML = detailHtml;
        showSection('product-detail');
        
        // 異步載入留言
        const commentsContainer = document.getElementById('comments-container');
        if (commentsContainer) {
            const commentsHtml = await displayNestedComments(comments);
            commentsContainer.innerHTML = commentsHtml;
        }
        
    } catch (error) {
        console.error('載入商品詳情失敗:', error);
        alert('Failed to load product details');
    }
}

// 分類篩選
function filterByCategory(category) {
    // 更新標籤樣式
    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // 載入篩選後的商品
    loadProductsByCategory(category);
}

// 載入分類商品
async function loadProductsByCategory(category) {
    try {
        let url = '/api/products';
        if (category !== 'all') {
            url += `?category=${category}`;
        }
        
        const response = await fetch(url);
        const products = await response.json();
        
        // 分離可購買和已售出的商品
        const availableProducts = products.filter(product => !product.is_sold);
        const soldProducts = products.filter(product => product.is_sold);
        
        displayProducts(availableProducts);
        displaySoldProducts(soldProducts);
    } catch (error) {
        console.error('載入分類商品失敗:', error);
    }
}

// 設置搜尋功能
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.querySelector('.search-btn');
    
    if (searchInput && searchBtn) {
        searchBtn.addEventListener('click', performSearch);
        searchInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                performSearch();
            }
        });
    }
}

// 執行搜尋
async function performSearch() {
    const searchTerm = document.getElementById('search-input').value.trim();
    
    try {
        let url = '/api/products';
        if (searchTerm) {
            url += `?search=${encodeURIComponent(searchTerm)}`;
        }
        
        const response = await fetch(url);
        const products = await response.json();
        
        displayProducts(products);
    } catch (error) {
        console.error('搜尋失敗:', error);
    }
}

// 登入
async function login(event) {
    event.preventDefault();
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('username', result.username);
            currentToken = result.token;
            currentUser = result.username;
            showLoggedInState();
            showSection('products');
            alert('登入成功！');
        } else {
            alert(result.error);
        }
    } catch (error) {
        alert('登入失敗，請稍後再試');
    }
}

// 註冊
async function register(event) {
    event.preventDefault();
    
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('Registration successful! Please login.');
            showLoginForm();
        } else {
            alert(result.error);
        }
    } catch (error) {
        alert('Registration failed, please try again');
    }
}

// 登出
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    // 清理當前用戶的頭像
    if (currentUser) {
        const avatarKey = `userAvatar_${currentUser.id}`;
        // 不刪除頭像，只是重置顯示
        const avatar = document.getElementById('user-avatar');
        if (avatar) {
            avatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
        }
    }
    
    currentToken = null;
    currentUser = null;
    showLoggedOutState();
    showSection('products');
    alert('登出成功');
}

// 顯示註冊表單
function showRegisterForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('register-form').style.display = 'block';
}

// 顯示登入表單
function showLoginForm() {
    document.getElementById('register-form').style.display = 'none';
    document.getElementById('login-form').style.display = 'block';
}

// 編輯商品
async function editProduct(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch(`/api/products/${productId}`);
        const product = await response.json();
        
        if (!response.ok) {
            alert('獲取商品資料失敗');
            return;
        }
        
        // 檢查商品是否已售出
        if (product.is_sold) {
            alert('商品已售出，無法編輯');
            return;
        }
        
        // 檢查是否為商品擁有者
        if (product.user_id !== currentUser.id) {
            alert('您沒有權限編輯此商品');
            return;
        }
        
        // 填充編輯表單
        document.getElementById('product-title').value = product.title;
        document.getElementById('product-description').value = product.description;
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-condition').value = product.condition_desc;
        document.getElementById('product-price').value = product.price || '';
        document.getElementById('product-quantity').value = product.quantity || 1;
        
        // 切換到編輯模式
        const form = document.getElementById('add-product-form');
        const submitBtn = form.querySelector('button[type="submit"]');
        
        submitBtn.textContent = '更新商品';
        submitBtn.onclick = (e) => updateProduct(e, productId);
        
        // 添加取消按鈕
        if (!form.querySelector('.btn-cancel')) {
            const cancelBtn = document.createElement('button');
            cancelBtn.type = 'button';
            cancelBtn.className = 'btn-cancel';
            cancelBtn.textContent = '取消編輯';
            cancelBtn.onclick = () => resetEditForm();
            submitBtn.parentNode.insertBefore(cancelBtn, submitBtn.nextSibling);
        }
        
        showSection('add-product');
        
    } catch (error) {
        console.error('編輯商品錯誤:', error);
        alert('編輯商品失敗');
    }
}

// 更新商品
async function updateProduct(event, productId) {
    event.preventDefault();
    
    const formData = new FormData();
    formData.append('title', document.getElementById('product-title').value);
    formData.append('description', document.getElementById('product-description').value);
    formData.append('category', document.getElementById('product-category').value);
    formData.append('condition_desc', document.getElementById('product-condition').value);
    formData.append('price', document.getElementById('product-price').value || '0');
    formData.append('quantity', document.getElementById('product-quantity').value || '1');
    
    const imageFile = document.getElementById('product-image').files[0];
    if (imageFile) {
        formData.append('image', imageFile);
    }
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            console.log('✅ 商品更新成功！');
            alert('商品更新成功！');
            resetEditForm();
            showSection('products');
            loadProducts();
        } else {
            alert(result.error || '更新失敗');
        }
    } catch (error) {
        console.error('更新商品錯誤:', error);
        alert('更新失敗');
    }
}

// 重置編輯表單
function resetEditForm() {
    const form = document.getElementById('add-product-form');
    const submitBtn = form.querySelector('button[type="submit"]');
    const cancelBtn = form.querySelector('.btn-cancel');
    
    form.reset();
    submitBtn.textContent = '發布商品';
    submitBtn.onclick = null;
    
    if (cancelBtn) {
        cancelBtn.remove();
    }
    
    setupAddProductForm();
}

// 查看編輯歷史
async function viewEditHistory(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch(`/api/products/${productId}/history`, {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        const history = await response.json();
        
        if (response.ok) {
            showEditHistoryModal(history);
        } else {
            alert(history.error || '獲取編輯歷史失敗');
        }
    } catch (error) {
        console.error('獲取編輯歷史錯誤:', error);
        alert('獲取編輯歷史失敗');
    }
}

// 顯示編輯歷史彈窗
function showEditHistoryModal(history) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="this.parentElement.parentElement.remove()">&times;</span>
            <h2>編輯歷史</h2>
            <div class="history-list">
                ${history.length === 0 ? '<p>暫無編輯記錄</p>' : 
                  history.map(record => `
                    <div class="history-item">
                        <h4>編輯時間: ${new Date(record.edited_at).toLocaleString()}</h4>
                        <div class="changes">
                            ${compareChanges(record.old_data, record.new_data)}
                        </div>
                    </div>
                  `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// 比較變更內容
function compareChanges(oldData, newData) {
    const changes = [];
    const fields = ['title', 'description', 'price', 'category', 'condition_desc', 'quantity'];
    
    fields.forEach(field => {
        if (oldData[field] !== newData[field]) {
            changes.push(`
                <div class="change-item">
                    <strong>${getFieldName(field)}:</strong><br>
                    <span class="old-value">舊值: ${oldData[field] || '無'}</span><br>
                    <span class="new-value">新值: ${newData[field] || '無'}</span>
                </div>
            `);
        }
    });
    
    return changes.length > 0 ? changes.join('') : '<p>無變更</p>';
}

function getFieldName(field) {
    const names = {
        title: '標題',
        description: '描述',
        price: '價格',
        category: '分類',
        condition_desc: '狀況',
        quantity: '數量'
    };
    return names[field] || field;
}

// 設置發布商品表單
function setupAddProductForm() {
    console.log('DEBUG: 設置發布商品表單');
    const form = document.getElementById('add-product-form');
    console.log('DEBUG: 表單元素:', form);
    if (form) {
        form.onsubmit = async (event) => {
            event.preventDefault();
            
            console.log('=== DEBUG: 開始發布商品 ===');
            console.log('currentUser:', currentUser);
            console.log('currentToken:', currentToken);
            
            if (!currentToken) {
                console.log('DEBUG: 沒有 token，請先登入');
                alert('請先登入');
                return;
            }
            
            // 收集表單資料
            const title = document.getElementById('product-title').value;
            const description = document.getElementById('product-description').value;
            const category = document.getElementById('product-category').value;
            const condition = document.getElementById('product-condition').value;
            const price = document.getElementById('product-price').value;
            const quantity = document.getElementById('product-quantity').value;
            const imageFile = document.getElementById('product-image').files[0];
            
            console.log('DEBUG: 表單資料:', {
                title, description, category, condition, price, quantity,
                hasImage: !!imageFile
            });
            
            // 檢查必填欄位
            if (!title || !description || !category || !condition) {
                console.log('DEBUG: 有必填欄位未填寫');
                alert('請填寫所有必填欄位');
                return;
            }
            
            const formData = new FormData();
            formData.append('title', title);
            formData.append('description', description);
            formData.append('category', category);
            formData.append('condition_desc', condition);
            formData.append('price', price || '0');
            formData.append('quantity', quantity || '1');
            
            if (imageFile) {
                formData.append('image', imageFile);
                console.log('DEBUG: 已附加圖片:', imageFile.name);
            }
            
            console.log('DEBUG: 發送資料到伺服器...');
            
            try {
                const response = await fetch('/api/products', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${currentToken}`
                    },
                    body: formData
                });
                
                console.log('DEBUG: 伺服器回應狀態:', response.status);
                console.log('DEBUG: 回應標頭:', response.headers);
                
                const result = await response.json();
                console.log('DEBUG: 伺服器回應內容:', result);
                
                if (response.ok) {
                    console.log('🎉 我已發佈商品成功！');
                    console.log('DEBUG: 商品發布成功！');
                    alert('商品發布成功！');
                    form.reset();
                    showSection('products');
                    loadProducts();
                } else {
                    console.log('DEBUG: 發布失敗:', result);
                    alert(result.error || '發布失敗');
                }
            } catch (error) {
                console.log('DEBUG: 網路錯誤:', error);
                alert('網路錯誤，請檢查伺服器是否運行');
            }
            
            console.log('=== DEBUG: 發布商品結束 ===');
        };
    }
}

// 按讚功能
async function toggleLike(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/likes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        if (response.ok) {
            const result = await response.json();
            alert(result.message);
            
            // 重新載入商品詳情以更新按讚數
            const productResponse = await fetch('/api/products');
            const products = await productResponse.json();
            const updatedProduct = products.find(p => p.id == productId);
            
            if (updatedProduct) {
                // 更新按讚按鈕的文字
                const likeBtn = document.querySelector(`button[onclick="toggleLike(${productId})"]`);
                if (likeBtn) {
                    likeBtn.innerHTML = `❤️ 按讚 (${updatedProduct.likes_count})`;
                }
            }
            
            loadProducts(); // 同時更新商品列表
        }
    } catch (error) {
        console.error('按讚失敗:', error);
    }
}

// 處理購買回應
async function handlePurchaseResponse(notificationId, action) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const confirmMessage = action === 'accept' ? '確定要接受這個購買請求嗎？' : '確定要拒絕這個購買請求嗎？';
    
    if (!confirm(confirmMessage)) {
        return;
    }
    
    try {
        const response = await fetch('/api/purchase-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                notification_id: notificationId,
                action: action
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            loadNotifications(); // 重新載入通知
            loadProducts(); // 重新載入商品列表
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('處理購買回應失敗:', error);
        alert('操作失敗');
    }
}

// 開始購買討論
async function startPurchaseChat(buyerId, productId, productTitle) {
    if (!currentToken) return;
    
    try {
        // 創建或獲取對話
        const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                other_user_id: buyerId,
                product_id: productId,
                product_title: productTitle,
                initial_message: `關於商品「${productTitle}」的交易討論，請告訴我您的付款方式和收貨地址等詳細資訊。`
            })
        });
        
        if (response.ok) {
            const conversation = await response.json();
            // 直接打開對話視窗
            showChatWindow(conversation.id, buyerId, productTitle);
        } else {
            alert('開始討論失敗');
        }
    } catch (error) {
        console.error('開始購買討論失敗:', error);
        alert('開始討論失敗');
    }
}

// 確定購買
async function confirmPurchase(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const message = prompt('請輸入購買留言（可選）：');
    if (message === null) return; // 用戶取消
    
    try {
        const response = await fetch('/api/purchase-request', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({
                product_id: productId,
                message: message
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('購買請求已發送給賣家！');
        } else {
            alert(result.error);
        }
    } catch (error) {
        console.error('購買請求失敗:', error);
        alert('購買請求失敗');
    }
}

// 收藏功能
async function toggleFavorite(productId) {
    if (!currentToken) {
        alert('Please login first');
        return;
    }
    
    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        alert(result.message);
        
    } catch (error) {
        console.error('Favorite failed:', error);
    }
}

// 添加留言
async function addComment(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const content = document.getElementById('comment-input').value.trim();
    if (!content) {
        alert('請輸入留言內容');
        return;
    }
    
    try {
        const response = await fetch('/api/comments', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ 
                product_id: productId, 
                content: content 
            })
        });
        
        const result = await response.json();
        if (response.ok) {
            document.getElementById('comment-input').value = '';
            showProductDetail(productId); // 重新載入
            alert('留言成功！');
            
            // 自動更新通知數量（可能有新的回覆通知）
            await updateNotificationCount();
        } else {
            alert(result.error);
        }
        
    } catch (error) {
        console.error('Comment failed:', error);
    }
}

// 載入個人中心
async function loadProfile() {
    if (!currentToken) {
        showSection('auth');
        return;
    }
    
    // 載入個人資訊
    await loadProfileInfo();
    
    // 確保DOM完全渲染後再載入商品
    setTimeout(async () => {
        // 手動設置active狀態
        document.querySelectorAll('.profile-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
        
        // 激活我的商品標籤
        const productsTab = document.querySelector('[onclick*="products"]');
        const productsContent = document.getElementById('products-tab');
        
        if (productsTab) productsTab.classList.add('active');
        if (productsContent) productsContent.classList.add('active');
        
        // 載入商品
        await loadUserProducts();
    }, 200);
}

// 載入個人資訊
async function loadProfileInfo() {
    if (!currentToken) {
        console.log('DEBUG: 無法載入個人資訊 - 缺少token');
        return;
    }
    
    try {
        console.log('DEBUG: 開始載入個人資訊...');
        
        // 從伺服器獲取最新用戶資料
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const userData = await response.json();
            console.log('DEBUG: 獲取用戶資料:', userData);
            
            // 更新 currentUser
            currentUser = userData;
            
            // 更新用戶名
            const profileUsername = document.getElementById('profile-username');
            if (profileUsername) {
                profileUsername.textContent = userData.username || '未知用戶';
                console.log('DEBUG: 更新用戶名:', userData.username);
            }
            
            // 更新註冊時間
            const profileJoinDate = document.getElementById('profile-join-date');
            if (profileJoinDate) {
                const joinDate = userData.created_at ? new Date(userData.created_at).toLocaleDateString('zh-TW') : '未知';
                profileJoinDate.textContent = `註冊時間：${joinDate}`;
                console.log('DEBUG: 更新註冊時間:', joinDate);
            }
            
            // 載入頭像
            await loadUserAvatar();
            
            // 載入統計數據
            await loadProfileStats();
            
        } else {
            console.error('獲取用戶資料失敗:', response.status);
            // 使用 localStorage 中的資料作為備用
            if (currentUser && currentUser.username) {
                const profileUsername = document.getElementById('profile-username');
                if (profileUsername) {
                    profileUsername.textContent = currentUser.username;
                }
            }
        }
        
    } catch (error) {
        console.error('載入個人資訊失敗:', error);
        // 使用 localStorage 中的資料作為備用
        if (currentUser && currentUser.username) {
            const profileUsername = document.getElementById('profile-username');
            if (profileUsername) {
                profileUsername.textContent = currentUser.username;
            }
        }
    }
}

// 載入統計數據
async function loadProfileStats() {
    if (!currentToken) return;
    
    try {
        // 載入商品和收藏數據
        const [productsRes, favoritesRes] = await Promise.all([
            fetch('/api/user/products', { headers: { 'Authorization': `Bearer ${currentToken}` } }),
            fetch('/api/user/favorites', { headers: { 'Authorization': `Bearer ${currentToken}` } })
        ]);
        
        const products = productsRes.ok ? await productsRes.json() : [];
        const favorites = favoritesRes.ok ? await favoritesRes.json() : [];
        
        // 更新統計數字
        document.getElementById('profile-products-count').textContent = `商品：${products.length}`;
        document.getElementById('profile-favorites-count').textContent = `收藏：${favorites.length}`;
        
    } catch (error) {
        console.error('載入統計數據失敗:', error);
    }
}

// 加入購物車
async function addToCart(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/cart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            // 更新購物車數量
            updateCartCount();
        } else {
            alert(result.error || '加入購物車失敗');
        }
        
    } catch (error) {
        console.error('加入購物車失敗:', error);
        alert('加入購物車失敗');
    }
}

// 刪除商品
async function deleteProduct(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    if (!confirm('確定要刪除這個商品嗎？')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('商品已刪除');
            loadProducts(); // 重新載入商品列表
        } else {
            alert(result.error || '刪除失敗');
        }
        
    } catch (error) {
        console.error('刪除商品失敗:', error);
        alert('刪除失敗');
    }
}
// 密碼強度檢查
function checkPasswordStrength(password) {
    const strengthIndicator = document.getElementById('password-strength');
    let strength = 0;
    
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/\d/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    strengthIndicator.className = 'password-strength';
    if (strength < 3) {
        strengthIndicator.classList.add('weak');
    } else if (strength < 4) {
        strengthIndicator.classList.add('medium');
    } else {
        strengthIndicator.classList.add('strong');
    }
}

// 監聽密碼輸入
document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('register-password');
    if (passwordInput) {
        passwordInput.addEventListener('input', function() {
            checkPasswordStrength(this.value);
        });
    }
});

// 顯示使用條款
function showTerms() {
    alert('使用條款：\n1. 禁止發布違法商品\n2. 確保商品描述真實\n3. 尊重其他用戶\n4. 保護個人隱私');
}

// 顯示隱私政策
function showPrivacy() {
    alert('隱私政策：\n1. 我們不會出售您的個人資料\n2. 僅用於平台功能運作\n3. 採用加密技術保護資料\n4. 您可隨時刪除帳號');
}
// 修復 showSection 函數
function showSection(sectionName) {
    // 移除所有 active 類別
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    
    // 安全地顯示選中的頁面
    const targetSection = document.getElementById(sectionName);
    if (targetSection) {
        targetSection.classList.add('active');
    } else {
        console.warn(`Section '${sectionName}' not found, defaulting to products`);
        const productsSection = document.getElementById('products');
        if (productsSection) {
            productsSection.classList.add('active');
        }
    }
    
    // 更新導航狀態
    const activeLink = document.querySelector(`[onclick="showSection('${sectionName}')"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    // 載入對應內容
    switch(sectionName) {
        case 'products':
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
            break;
        case 'add-product':
            if (typeof setupAddProductForm === 'function') {
                setupAddProductForm();
            }
            break;
        case 'profile':
            // 移除未定義的函數調用
            break;
    }
}

// 修復頭像上傳 - 使用伺服器存儲
async function uploadAvatar() {
    const fileInput = document.getElementById('avatar-upload');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('請選擇頭像圖片');
        return;
    }
    
    if (!currentUser) {
        alert('請先登入');
        return;
    }
    
    // 創建 FormData
    const formData = new FormData();
    const fileExtension = file.name.split('.').pop();
    const newFileName = `avatar_${currentUser.id}_${Date.now()}.${fileExtension}`;
    formData.append('avatar', file, newFileName);
    
    try {
        const response = await fetch('/api/upload-avatar', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`
            },
            body: formData
        });
        
        if (response.ok) {
            const result = await response.json();
            
            // 更新頭像顯示
            const avatar = document.getElementById('user-avatar');
            const panelAvatar = document.getElementById('panel-user-avatar');
            const profileAvatar = document.getElementById('profile-main-avatar');
            
            if (avatar) avatar.src = result.avatarUrl;
            if (panelAvatar) panelAvatar.src = result.avatarUrl;
            if (profileAvatar) profileAvatar.src = result.avatarUrl; // 同步更新個人中心頭像
            
            // 更新用戶資料中的頭像URL
            if (currentUser) {
                currentUser.avatar_url = result.avatarUrl;
                // 同步更新 localStorage
                const avatarKey = `userAvatar_${currentUser.id}`;
                localStorage.setItem(avatarKey, result.avatarUrl);
            }
            
            alert('頭像已更新！');
            closeAvatarModal();
        } else {
            const error = await response.json();
            alert(error.error || '上傳失敗');
        }
    } catch (error) {
        console.error('頭像上傳失敗:', error);
        alert('網路錯誤，請稍後再試');
    }
}

// 修復頭像載入 - 從伺服器載入
async function loadUserAvatar() {
    const avatar = document.getElementById('user-avatar');
    const panelAvatar = document.getElementById('panel-user-avatar');
    const profileAvatar = document.getElementById('profile-main-avatar');
    
    if (!currentToken || !currentUser) {
        // 重置為默認頭像
        const defaultAvatar = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
        if (avatar) avatar.src = defaultAvatar;
        if (panelAvatar) panelAvatar.src = defaultAvatar;
        if (profileAvatar) profileAvatar.src = defaultAvatar;
        return;
    }
    
    // 先檢查 localStorage
    const avatarKey = `userAvatar_${currentUser.id}`;
    const savedAvatar = localStorage.getItem(avatarKey);
    
    console.log('DEBUG loadUserAvatar - avatarKey:', avatarKey);
    console.log('DEBUG loadUserAvatar - savedAvatar:', savedAvatar);
    
    if (savedAvatar) {
        if (avatar) avatar.src = savedAvatar;
        if (panelAvatar) panelAvatar.src = savedAvatar;
        if (profileAvatar) profileAvatar.src = savedAvatar;
        console.log('DEBUG: 從localStorage載入頭像到所有位置');
        return;
    }
    
    try {
        // 從伺服器獲取用戶資料
        const response = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const userData = await response.json();
            const avatarUrl = userData.avatar_url;
            
            console.log('DEBUG: 從服務器獲取頭像URL:', avatarUrl);
            
            if (avatarUrl) {
                if (avatar) avatar.src = avatarUrl;
                if (panelAvatar) panelAvatar.src = avatarUrl;
                if (profileAvatar) profileAvatar.src = avatarUrl;
                
                // 更新 localStorage
                localStorage.setItem(avatarKey, avatarUrl);
            }
            
            // 更新 currentUser 資料
            if (currentUser && userData.avatar_url) {
                currentUser.avatar_url = userData.avatar_url;
            }
        }
    } catch (error) {
        console.error('載入頭像失敗:', error);
    }
}

// 修復登出函數
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    
    // 關閉用戶面板
    closeUserPanel();
    
    // 重置頭像為默認
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
        avatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
    }
    
    currentToken = null;
    currentUser = null;
    showLoggedOutState();
    showSection('products');
    alert('登出成功');
}

// 捕獲並忽略 classifier.js 錯誤
window.addEventListener('error', function(e) {
    if (e.filename && e.filename.includes('classifier.js')) {
        console.log('忽略 classifier.js 錯誤（通常來自瀏覽器擴展）');
        e.preventDefault();
        return false;
    }
});

// 在頁面載入時執行修復
document.addEventListener('DOMContentLoaded', async function() {
    // 重新定義全局函數 - 移除 showProductDetail 覆蓋
    window.showSection = showSection;
    window.logout = logout;
    window.loadUserAvatar = loadUserAvatar;
    window.uploadAvatar = uploadAvatar;
    window.login = login;
    window.checkAuth = checkAuth;
    window.toggleUserPanel = toggleUserPanel;
    window.openUserPanel = openUserPanel;
    window.closeUserPanel = closeUserPanel;
    window.updatePanelUserInfo = updatePanelUserInfo;
    window.showInbox = showInbox;
    window.showInboxTab = showInboxTab;
    window.loadNotifications = loadNotifications;
    window.handlePurchaseResponse = handlePurchaseResponse;
    window.startPurchaseChat = startPurchaseChat;
    window.markAsRead = markAsRead;
    window.markAllAsRead = markAllAsRead;
    window.updateNotificationCount = updateNotificationCount;
    window.markAsReadAndView = markAsReadAndView;
    window.buyProduct = buyProduct;
    window.buyNow = buyNow;
    window.makeOffer = makeOffer;
    window.toggleLike = toggleLike;
    window.showLoggedInState = showLoggedInState;
    window.displayCartItems = displayCartItems;
    window.addToWishlist = addToWishlist;
    window.showMyProducts = showMyProducts;
    window.showMyFavorites = showMyFavorites;
    window.showAvatarUpload = showAvatarUpload;
    window.loadUserPanelInfo = loadUserPanelInfo;
    window.removeFromWishlist = removeFromWishlist;
    window.updateCartCount = updateCartCount;
    window.updateCartTotal = updateCartTotal;
    window.viewProductDetails = viewProductDetails;
    window.proceedToCheckout = proceedToCheckout;
    window.removeFromFavorites = removeFromFavorites;
    window.loadUserExchanges = loadUserExchanges;
    window.handleExchangeFromProfile = handleExchangeFromProfile;
    window.loadProfile = loadProfile;
    window.getCategoryName = getCategoryName;
    
    // 重新執行認證檢查
    await checkAuth();
    
    console.log('修復函數已載入 - 使用原有商品詳情頁面');
});
// 修復登入函數
async function login(event) {
    event.preventDefault();
    
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;
    
    if (!username || !password) {
        alert('請輸入用戶名和密碼');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            localStorage.setItem('token', result.token);
            localStorage.setItem('username', result.username);
            currentToken = result.token;
            
            // 解析 JWT 獲取用戶ID
            try {
                const payload = JSON.parse(atob(result.token.split('.')[1]));
                currentUser = {
                    id: payload.userId,
                    username: payload.username || result.username,
                    email: result.user ? result.user.email : null // 從 user 物件中獲取 email
                };
                console.log('登入成功，用戶資料:', currentUser);
            } catch (e) {
                currentUser = { 
                    username: result.username, 
                    id: Date.now(),
                    email: result.user ? result.user.email : null
                };
            }
            
            showLoggedInState();
            loadUserAvatar();
            showSection('products');
            alert('登入成功！');
        } else {
            alert(result.error || '登入失敗');
        }
    } catch (error) {
        console.error('登入錯誤:', error);
        alert('網路錯誤，請稍後再試');
    }
}

// 修復 checkAuth 函數，確保頁面載入時正確設定用戶資料
async function checkAuth() {
    const token = localStorage.getItem('token');
    const username = localStorage.getItem('username');
    
    if (token && username) {
        currentToken = token;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            currentUser = {
                id: payload.userId,
                username: payload.username || username
            };
            console.log('檢查認證，用戶資料:', currentUser);
            
            // 從伺服器獲取完整用戶資料（包括 email）
            const testResponse = await fetch('/api/user/profile', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            
            if (!testResponse.ok) {
                // Token無效，清除並登出
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                currentToken = null;
                currentUser = null;
                showLoggedOutState();
                return;
            }
            
            // 更新 currentUser 包含完整資料
            const userData = await testResponse.json();
            currentUser = userData;
            console.log('更新完整用戶資料:', currentUser);
            
        } catch (e) {
            // Token解析失敗，清除並登出
            localStorage.removeItem('token');
            localStorage.removeItem('username');
            currentToken = null;
            currentUser = null;
            showLoggedOutState();
            return;
        }
        showLoggedInState();
        loadUserAvatar();
        
        // 設置個人中心自動載入監聽器
        setupProfileAutoLoad();
    } else {
        showLoggedOutState();
    }
}
// 用戶面板控制函數
function toggleUserPanel() {
    const panel = document.getElementById('user-panel');
    const overlay = document.getElementById('user-panel-overlay');
    
    if (!panel || !overlay) return;
    
    if (panel.classList.contains('active')) {
        closeUserPanel();
    } else {
        openUserPanel();
    }
}

function openUserPanel() {
    const panel = document.getElementById('user-panel');
    const overlay = document.getElementById('user-panel-overlay');
    
    if (!panel || !overlay) return;
    
    // 更新用戶資訊
    updatePanelUserInfo();
    
    // 顯示面板
    overlay.classList.add('active');
    panel.classList.add('active');
    
    // 防止背景滾動
    document.body.style.overflow = 'hidden';
}

function closeUserPanel() {
    const panel = document.getElementById('user-panel');
    const overlay = document.getElementById('user-panel-overlay');
    
    if (!panel || !overlay) return;
    
    // 隱藏面板
    overlay.classList.remove('active');
    panel.classList.remove('active');
    
    // 恢復背景滾動
    document.body.style.overflow = '';
}

// 更新面板中的用戶資訊
function updatePanelUserInfo() {
    const panelAvatar = document.getElementById('panel-user-avatar');
    const panelUsername = document.getElementById('panel-username');
    const panelEmail = document.getElementById('panel-user-email');
    
    if (currentUser && currentToken) {
        // 更新頭像
        if (panelAvatar) {
            const avatarKey = `userAvatar_${currentUser.id}`;
            const savedAvatar = localStorage.getItem(avatarKey);
            if (savedAvatar) {
                panelAvatar.src = savedAvatar;
            }
        }
        
        // 更新用戶名稱
        if (panelUsername) {
            panelUsername.textContent = currentUser.username || '未知用戶';
        }
        
        // 更新郵箱（如果有的話）
        if (panelEmail) {
            panelEmail.textContent = currentUser.email || '已登入用戶';
        }
    } else {
        // 未登入狀態
        if (panelAvatar) {
            panelAvatar.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 24 24' fill='%23666'%3E%3Cpath d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/%3E%3C/svg%3E";
        }
        if (panelUsername) {
            panelUsername.textContent = '訪客';
        }
        if (panelEmail) {
            panelEmail.textContent = '未登入';
        }
    }
}
// 收件夾功能
async function showInbox() {
    showSection('inbox');
    
    // 進入收件夾時自動標記所有未讀通知為已讀
    if (currentToken) {
        try {
            const response = await fetch('/api/notifications/mark-all-read', {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.markedCount > 0) {
                    console.log(`✅ 自動標記了 ${result.markedCount} 個通知為已讀`);
                    updateNotificationBadge([]); // 清空徽章
                }
            }
        } catch (error) {
            console.error('自動標記通知已讀失敗:', error);
        }
    }
    
    loadNotifications();
}

function showInboxTab(tab) {
    currentInboxFilter = tab; // 記錄當前標籤
    document.querySelectorAll('.inbox-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[onclick="showInboxTab('${tab}')"]`).classList.add('active');
    loadNotifications(tab);
}

async function loadNotifications(filter = 'all') {
    if (!currentToken) return;
    
    if (filter === 'conversations') {
        await loadConversations();
        return;
    }
    
    try {
        const [notificationsResponse, conversationsResponse] = await Promise.all([
            fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            }),
            fetch('/api/conversations', {
                headers: { 'Authorization': `Bearer ${currentToken}` }
            })
        ]);
        
        if (notificationsResponse.ok) {
            const notifications = await notificationsResponse.json();
            let conversations = [];
            
            if (conversationsResponse.ok) {
                conversations = await conversationsResponse.json();
            }
            
            displayNotifications(notifications, conversations, filter);
            updateNotificationBadge(notifications);
        }
    } catch (error) {
        console.error('載入通知失敗:', error);
    }
}

// 載入對話列表
async function loadConversations() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/conversations', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const conversations = await response.json();
            displayConversations(conversations);
        }
    } catch (error) {
        console.error('載入對話失敗:', error);
    }
}

// 顯示對話列表
function displayConversations(conversations) {
    const container = document.getElementById('inbox-content');
    if (!container) return;
    
    if (conversations.length === 0) {
        container.innerHTML = '<p class="no-notifications">暫無對話</p>';
        return;
    }
    
    container.innerHTML = conversations.map(conv => `
        <div class="conversation-item ${conv.unreadCount > 0 ? 'unread' : ''}" onclick="showChatWindow(${conv.id}, ${conv.otherUser.id}, '${conv.product_title || ''}')">>
            <div class="conversation-header">
                <div class="conversation-user">
                    ${conv.otherUser.avatar ? `<img src="${conv.otherUser.avatar}" class="user-avatar-small">` : '👤'}
                    <span class="username">${conv.otherUser.username}${conv.product_title ? ` {${conv.product_title}}` : ''}</span>
                </div>
                <div class="conversation-meta">
                    ${conv.unreadCount > 0 ? `<span class="unread-badge">${conv.unreadCount}</span>` : ''}
                    <span class="conversation-time">${formatTime(conv.updatedAt)}</span>
                </div>
            </div>
            <div class="conversation-preview">
                ${conv.latestMessage ? conv.latestMessage.content : '開始對話...'}
            </div>
        </div>
    `).join('');
}

// 只更新通知數量（不影響當前頁面內容）
async function updateNotificationCount() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const notifications = await response.json();
            updateNotificationBadge(notifications);
        }
    } catch (error) {
        console.error('更新通知數量失敗:', error);
    }
}

async function displayNotifications(notifications, conversations = [], filter) {
    const container = document.getElementById('inbox-content');
    if (!container) return;
    
    // 獲取所有商品數據
    let products = [];
    try {
        const productsResponse = await fetch('/api/products');
        if (productsResponse.ok) {
            products = await productsResponse.json();
        }
    } catch (error) {
        console.error('獲取商品數據失敗:', error);
    }
    
    // 獲取所有用戶數據
    let users = [];
    try {
        const usersResponse = await fetch('/api/users/avatars');
        if (usersResponse.ok) {
            users = await usersResponse.json();
        }
    } catch (error) {
        console.error('獲取用戶數據失敗:', error);
    }
    
    let allItems = [];
    
    // 處理通知
    let filtered = notifications;
    if (filter === 'pending') {
        filtered = notifications.filter(n => n.status === 'pending');
    } else if (filter === 'completed') {
        filtered = notifications.filter(n => n.status === 'completed');
    }
    
    // 將非私訊通知加入列表
    const nonPrivateNotifications = filtered.filter(n => n.type !== 'private_message');
    allItems = allItems.concat(nonPrivateNotifications.map(n => ({
        ...n,
        itemType: 'notification',
        sortTime: new Date(n.created_at)
    })));
    
    // 如果是"全部"標籤，加入對話摘要
    if (filter === 'all') {
        allItems = allItems.concat(conversations.map(conv => ({
            ...conv,
            itemType: 'conversation',
            sortTime: new Date(conv.updatedAt)
        })));
    }
    
    // 按時間排序（最新在上）
    allItems.sort((a, b) => b.sortTime - a.sortTime);
    
    if (allItems.length === 0) {
        container.innerHTML = '<p class="no-notifications">暫無通知</p>';
        return;
    }
    
    // 獲取通知相關的商品標題
    function getNotificationProductTitle(notification, products) {
        if (notification.product_title) {
            return notification.product_title;
        }
        
        if (notification.product_id && products && products.length > 0) {
            const product = products.find(p => p.id === notification.product_id);
            return product ? product.title : '未知商品';
        }
        
        if (notification.content) {
            const match = notification.content.match(/「(.+?)」/);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        return '相關商品';
    }
    
    container.innerHTML = allItems.map(item => {
        if (item.itemType === 'conversation') {
            // 對話項目
            return `
                <div class="conversation-item ${item.unreadCount > 0 ? 'unread' : ''}" onclick="showChatWindow(${item.id}, ${item.otherUser.id})">
                    <div class="conversation-header">
                        <div class="conversation-user">
                            ${item.otherUser.avatar ? `<img src="${item.otherUser.avatar}" class="user-avatar-small">` : '👤'}
                            <span class="username">${item.otherUser.username}</span>
                        </div>
                        <div class="conversation-meta">
                            ${item.unreadCount > 0 ? `<span class="unread-badge">${item.unreadCount}</span>` : ''}
                            <span class="conversation-time">${formatTime(item.updatedAt)}</span>
                        </div>
                    </div>
                    <div class="conversation-preview">
                        💌 ${item.latestMessage ? item.latestMessage.content : '開始對話...'}
                    </div>
                    </div>
                </div>
            `;
        } else {
            // 通知項目
            const productTitle = getNotificationProductTitle(item, products);
            
            return `
            <div class="notification-item ${item.read ? '' : 'unread'}" data-notification-id="${item.id}" onclick="markAsReadAndView(${item.id})">
                <div class="notification-header">
                    <span class="notification-title">${getNotificationTitle(item, users)}</span>
                    <span class="notification-time">${formatTime(item.created_at)}</span>
                </div>
                <div class="notification-content">
                    ${item.type !== 'private_message' ? `
                        <div class="notification-product">
                            <strong>商品：${productTitle}</strong>
                        </div>
                    ` : ''}
                    <div class="notification-message">${item.content || item.message || '私人訊息'}</div>
                    ${item.message ? `<div class="notification-extra">留言：${item.message}</div>` : ''}
                </div>
                ${item.type === 'purchase_request' && item.status === 'pending' ? `
                    <div class="notification-actions" onclick="event.stopPropagation()">
                        ${item.isSentRequest ? `
                            <!-- 發出的購買請求 -->
                            <button class="btn-waiting" disabled>⏳ 等待賣家回應</button>
                            <button class="btn-view" onclick="viewProductDetail(${item.product_id})">👁️ 查看商品</button>
                        ` : `
                            <!-- 收到的購買請求 -->
                            <button class="btn-chat" onclick="startPurchaseChat(${item.buyer_id}, ${item.product_id}, '${item.product_title}')">💬 討論交易</button>
                            <button class="btn-accept" onclick="handlePurchaseResponse(${item.id}, 'accept')">✅ 接受出售</button>
                            <button class="btn-reject" onclick="handlePurchaseResponse(${item.id}, 'reject')">❌ 拒絕出售</button>
                            <button class="btn-view" onclick="viewProductDetail(${item.product_id})">👁️ 查看商品</button>
                        `}
                    </div>
                ` : (item.type === 'comment' || item.type === 'comment_reply') ? `
                    <div class="notification-actions" onclick="event.stopPropagation()">
                        <button class="btn-reply-notification" onclick="showNotificationReply(${item.id})">💬 直接回覆</button>
                        <button class="btn-view" onclick="viewProductDetail(${item.product_id})">👁️ 查看商品</button>
                    </div>
                    <div class="notification-reply-form" id="notification-reply-${item.id}" style="display: none;">
                        <textarea id="notification-reply-input-${item.id}" placeholder="直接回覆..." onclick="event.stopPropagation()" onkeydown="event.stopPropagation()" onfocus="event.stopPropagation()"></textarea>
                        <div class="reply-buttons">
                            <button onclick="event.stopPropagation(); submitNotificationReply(${item.id})" class="btn-primary">發送回覆</button>
                            <button onclick="event.stopPropagation(); hideNotificationReply(${item.id})" class="btn-secondary">取消</button>
                        </div>
                    </div>
                ` : ''}
            </div>
            `;
        }
    }).join('');
}

function getNotificationTitle(notification, users = []) {
    switch(notification.type) {
        case 'purchase_request':
            // 判斷是收到的還是發出的請求
            if (notification.isSentRequest) {
                return `⏳ 你向賣家發出購買請求 - 等待回應中`;
            } else {
                return `💰 ${notification.buyer_name || '買家'} 想要購買您的商品`;
            }
        case 'purchase_accepted':
            if (notification.seller_name && notification.seller_email) {
                return `✅ 賣家 ${notification.seller_name} 已接受 (📧 ${notification.seller_email})`;
            }
            return `✅ 賣家已接受您的購買請求`;
        case 'purchase_rejected':
            return `❌ 賣家拒絕了您的購買請求`;
        case 'comment':
            return `💬 有新留言`;
        case 'comment_reply':
            return `💬 有人回覆了你的留言`;
        case 'private_message':
            // 使用 getUserAvatar 函數獲取頭像
            const avatarPromise = getUserAvatar(notification.sender_id, notification.sender_name);
            avatarPromise.then(avatarHtml => {
                // 更新通知標題
                const titleElement = document.querySelector(`[data-notification-id="${notification.id}"] .notification-title`);
                if (titleElement) {
                    titleElement.innerHTML = `💌 ${avatarHtml} ${notification.sender_name || '用戶'} 發送了私人訊息`;
                }
            });
            return `💌 ${notification.sender_name || '用戶'} 發送了私人訊息`;
        case 'item_sold':
            if (notification.buyer_name && notification.buyer_email) {
                return `🎉 商品已售出給 ${notification.buyer_name} (📧 ${notification.buyer_email})`;
            }
            return `🎉 您的商品已成功售出`;
        case 'purchase_completed':
            return `🎉 購買成功！`;
        default:
            return '📬 新通知';
    }
}

function viewNotificationDetail(notificationId) {
    if (!notificationId) return;
    
    // 獲取通知詳情
    fetch('/api/notifications', {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(response => response.json())
    .then(notifications => {
        const notification = notifications.find(n => n.id === notificationId);
        if (!notification) return;
        
        // 根據通知類型處理
        if (notification.type === 'private_message' && notification.conversation_id) {
            // 開啟聊天窗口
            showChatWindow(notification.conversation_id, notification.sender_id);
        } else {
            // 其他通知跳轉到個人中心
            showSection('profile');
        }
    })
    .catch(error => console.error('獲取通知詳情失敗:', error));
}

function viewProductDetail(productId) {
    if (productId) {
        showProductDetail(productId);
        closeUserPanel();
    }
}

function updateNotificationBadge(notifications) {
    const badge = document.getElementById('notification-badge');
    const inboxCount = document.getElementById('inbox-count');
    const unreadCount = notifications.filter(n => !n.read).length;
    
    if (unreadCount > 0) {
        if (badge) {
            badge.textContent = unreadCount;
            badge.style.display = 'flex';
            badge.style.cursor = 'pointer';
            badge.title = '點擊標記所有通知為已讀';
            badge.onclick = markAllAsRead;
        }
        if (inboxCount) {
            inboxCount.textContent = unreadCount;
            inboxCount.style.display = 'block';
        }
    } else {
        if (badge) badge.style.display = 'none';
        if (inboxCount) inboxCount.style.display = 'none';
    }
}

// 處理購買回應
async function handlePurchaseResponse(notificationId, action, productId) {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/purchase-response', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ 
                notification_id: notificationId, 
                action
            })
        });
        
        if (response.ok) {
            if (action === 'accept') {
                alert('✅ 已接受購買請求！商品已標記為售出');
            } else {
                alert('❌ 已拒絕購買請求');
            }
            
            // 自動標記相關通知為已讀並更新徽章
            await markAsRead(notificationId);
            await updateNotificationCount();
            
            loadNotifications();
            // 重新載入商品列表以更新狀態
            if (typeof loadProducts === 'function') {
                loadProducts();
            }
        } else {
            const error = await response.json();
            alert(error.message || '操作失敗');
        }
    } catch (error) {
        console.error('處理購買回應失敗:', error);
        alert('網路錯誤，請稍後再試');
    }
}

// 標記為已讀
async function markAsRead(notificationId) {
    if (!currentToken) return;
    
    try {
        await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        loadNotifications();
    } catch (error) {
        console.error('標記已讀失敗:', error);
    }
}

// 標記所有通知為已讀
async function markAllAsRead() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        const notifications = await response.json();
        
        const unreadNotifications = notifications.filter(n => !n.read);
        for (const notification of unreadNotifications) {
            await fetch(`/api/notifications/${notification.id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${currentToken}` }
            });
        }
        
        updateNotificationBadge([]);
        
        const inboxSection = document.getElementById('inbox');
        if (inboxSection && inboxSection.style.display !== 'none') {
            loadNotifications(currentInboxFilter);
        }
        
    } catch (error) {
        console.error('標記所有通知為已讀失敗:', error);
    }
}

// 自動更新通知數量
async function updateNotificationCount() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/notifications', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            const notifications = await response.json();
            updateNotificationBadge(notifications);
        }
    } catch (error) {
        console.error('更新通知數量失敗:', error);
    }
}

// 點擊通知時標記已讀並查看詳情
async function markAsReadAndView(notificationId) {
    await markAsRead(notificationId);
    viewNotificationDetail(notificationId);
}

// 購買/喊價功能
function buyProduct(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const price = prompt('請輸入您的出價：');
    if (price && !isNaN(price)) {
        createExchangeRequest(productId, 'buy', parseFloat(price));
    }
}

function makeOffer(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const offer = prompt('請輸入您的喊價：');
    if (offer && !isNaN(offer)) {
        createExchangeRequest(productId, 'offer', parseFloat(offer));
    }
}

async function createExchangeRequest(productId, type, amount) {
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId, type, amount })
        });
        
        if (response.ok) {
            alert(type === 'buy' ? '購買請求已發送' : '喊價已發送');
        }
    } catch (error) {
        console.error('發送請求失敗:', error);
    }
}

function formatTime(dateString) {
    if (!dateString) return '未知時間';
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '無效時間';
    
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return '剛剛';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分鐘前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小時前`;
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)}天前`;
    
    // 超過30天顯示具體日期
    return date.toLocaleDateString('zh-TW', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
// 修復 showLoggedInState - 登入時自動載入通知
function showLoggedInState() {
    document.getElementById('auth-link').style.display = 'none';
    document.getElementById('logout-link').style.display = 'none';
    document.getElementById('add-product-link').style.display = 'inline';
    document.getElementById('profile-icon').style.display = 'block';
    
    // 顯示個人篩選按鈕
    const myProductsTab = document.getElementById('my-products-tab');
    const myFavoritesTab = document.getElementById('my-favorites-tab');
    if (myProductsTab) myProductsTab.style.display = 'inline-block';
    if (myFavoritesTab) myFavoritesTab.style.display = 'inline-block';
    
    // 載入用戶頭像和詳細資訊
    loadUserAvatar();
    loadUserPanelInfo();
    updateCartCount();
    
    // 自動載入通知
    loadNotifications();
}
// 修復購物車功能 - 改為願望清單
async function displayCartItems() {
    const cartItems = document.getElementById('cart-items');
    if (!cartItems) return;
    
    if (!currentToken) {
        cartItems.innerHTML = '<p class="empty-cart">請先登入</p>';
        return;
    }
    
    try {
        const response = await fetch('/api/user/cart', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) {
            cartItems.innerHTML = '<p class="empty-cart">載入失敗</p>';
            return;
        }
        
        const cartProducts = await response.json();
        
        if (cartProducts.length === 0) {
            cartItems.innerHTML = '<p class="empty-cart">您的購物車是空的</p>';
            updateCartTotal(0);
            return;
        }
        
        cartItems.innerHTML = cartProducts.map(item => `
            <div class="cart-item">
                <img src="${item.image_url || '/placeholder.jpg'}" alt="${item.title}" onclick="viewProductDetails(${item.id})">
                <div class="cart-item-info">
                    <h4 onclick="viewProductDetails(${item.id})">${item.title}</h4>
                    <p class="cart-item-price">$${item.price || '面議'}</p>
                    <div class="cart-item-actions">
                        <button class="btn-view" onclick="viewProductDetails(${item.id})">查看詳情</button>
                        <button class="btn-remove" onclick="removeFromCart(${item.id})">移除</button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // 計算總價
        const total = cartProducts.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            return sum + price;
        }, 0);
        
        updateCartTotal(total);
        
    } catch (error) {
        console.error('載入購物車失敗:', error);
        cartItems.innerHTML = '<p class="empty-cart">載入購物車失敗</p>';
    }
}

// 從購物車移除商品
async function removeFromCart(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/user/cart', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            displayCartItems();
            updateCartCount();
        } else {
            alert(result.error || '移除失敗');
        }
        
    } catch (error) {
        console.error('移除商品失敗:', error);
        alert('移除商品失敗');
    }
}

// 添加到願望清單
function addToWishlist(product) {
    if (!currentUser) {
        alert('請先登入');
        return;
    }
    
    const wishlistKey = `wishlist_${currentUser.id}`;
    let wishlist = JSON.parse(localStorage.getItem(wishlistKey) || '[]');
    
    // 檢查是否已存在
    if (wishlist.find(item => item.id === product.id)) {
        alert('商品已在願望清單中');
        return;
    }
    
    wishlist.push(product);
    localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
    updateCartCount();
    alert('已添加到願望清單');
}

// 從願望清單移除
function removeFromWishlist(productId) {
    if (!currentUser) return;
    
    const wishlistKey = `wishlist_${currentUser.id}`;
    let wishlist = JSON.parse(localStorage.getItem(wishlistKey) || '[]');
    wishlist = wishlist.filter(item => item.id !== productId);
    localStorage.setItem(wishlistKey, JSON.stringify(wishlist));
    
    updateCartCount();
    displayCartItems();
}

// 更新購物車計數
async function updateCartCount() {
    const cartCount = document.getElementById('cart-count');
    if (!cartCount || !currentToken) return;
    
    try {
        const response = await fetch('/api/user/cart', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) return;
        
        const cartItems = await response.json();
        
        if (cartItems.length > 0) {
            cartCount.textContent = cartItems.length;
            cartCount.style.display = 'flex';
        } else {
            cartCount.style.display = 'none';
        }
    } catch (error) {
        console.error('更新購物車數量失敗:', error);
    }
}


// 立即購買功能
async function buyNow(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    const product = window.allProducts?.find(p => p.id === productId);
    if (!product) return;
    
    const confirmBuy = confirm(`確定要購買「${product.title}」嗎？\n價格：${product.price ? `$${product.price}` : '面議'}`);
    
    if (confirmBuy) {
        try {
            const response = await fetch('/api/purchase', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${currentToken}`
                },
                body: JSON.stringify({ 
                    productId: productId,
                    type: 'buy',
                    amount: product.price || 0
                })
            });
            
            if (response.ok) {
                alert('購買請求已發送給賣家！');
                closeProductModal();
            } else {
                const error = await response.json();
                alert(error.message || '購買失敗');
            }
        } catch (error) {
            console.error('購買錯誤:', error);
            alert('網路錯誤，請稍後再試');
        }
    }
}
// 修復交換記錄顯示 - 添加處理按鈕
async function loadUserExchanges() {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/user/exchanges', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (response.ok) {
            const exchanges = await response.json();
            displayUserExchanges(exchanges);
        }
    } catch (error) {
        console.error('載入交換記錄失敗:', error);
    }
}

function displayUserExchanges(exchanges) {
    const container = document.getElementById('user-exchanges');
    if (!container) return;
    
    if (exchanges.length === 0) {
        container.innerHTML = '<p>暫無交易記錄</p>';
        return;
    }
    
    container.innerHTML = exchanges.map(exchange => `
        <div class="exchange-item">
            <div class="exchange-header">
                <h4>${exchange.product_title}</h4>
                <span class="exchange-status status-${exchange.status}">
                    ${getStatusText(exchange.status)}
                </span>
            </div>
            <div class="exchange-details">
                <p>💰 金額: $${exchange.amount || '面議'}</p>
                <p>👤 ${exchange.requester_id === currentUser.id ? '賣家' : '買家'}: ${exchange.other_user}</p>
                <p>📅 時間: ${formatTime(exchange.created_at)}</p>
            </div>
            ${exchange.status === 'pending' && exchange.owner_id === currentUser.id ? `
                <div class="exchange-actions">
                    <button class="btn-accept" onclick="handleExchangeFromProfile(${exchange.id}, 'accepted')">✅ 接受</button>
                    <button class="btn-reject" onclick="handleExchangeFromProfile(${exchange.id}, 'rejected')">❌ 拒絕</button>
                </div>
            ` : ''}
        </div>
    `).join('');
}

function getStatusText(status) {
    const statusMap = {
        'pending': '等待中',
        'completed': '已完成',
        'rejected': '已拒絕'
    };
    return statusMap[status] || status;
}

// 從個人中心處理交換
async function handleExchangeFromProfile(transactionId, action) {
    if (!currentToken) return;
    
    try {
        const response = await fetch('/api/exchange-response-direct', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ transactionId, action })
        });
        
        if (response.ok) {
            alert(action === 'accepted' ? '✅ 已接受交易' : '❌ 已拒絕交易');
            loadUserExchanges(); // 重新載入
            loadNotifications(); // 更新通知
        } else {
            const error = await response.json();
            alert(error.message || '操作失敗');
        }
    } catch (error) {
        console.error('處理交易失敗:', error);
        alert('網路錯誤，請稍後再試');
    }
}
// 更新購物車總價
function updateCartTotal(total) {
    const totalElement = document.getElementById('cart-total-amount');
    const checkoutBtn = document.querySelector('.btn-checkout');
    
    if (totalElement) {
        totalElement.textContent = total.toFixed(0);
    }
    
    if (checkoutBtn) {
        checkoutBtn.disabled = total === 0;
    }
}

// 查看商品詳情
function viewProductDetails(productId) {
    // 關閉購物車
    const cartSidebar = document.getElementById('cart-sidebar');
    cartSidebar.classList.remove('open');
    
    // 切換到商品頁面
    showSection('products');
    
    // 載入商品並滾動到指定商品
    setTimeout(() => {
        const productElement = document.querySelector(`[data-product-id="${productId}"]`);
        if (productElement) {
            productElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            productElement.style.border = '2px solid #007bff';
            setTimeout(() => {
                productElement.style.border = '';
            }, 3000);
        }
    }, 100);
}

// 結帳功能
async function proceedToCheckout() {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        // 獲取購物車商品
        const response = await fetch('/api/user/cart', {
            headers: {
                'Authorization': `Bearer ${currentToken}`
            }
        });
        
        if (!response.ok) {
            alert('無法載入購物車');
            return;
        }
        
        const cartItems = await response.json();
        
        if (cartItems.length === 0) {
            alert('購物車是空的！');
            return;
        }
        
        const total = cartItems.reduce((sum, item) => {
            const price = parseFloat(item.price) || 0;
            return sum + price;
        }, 0);
        
        const itemCount = cartItems.length;
        const itemText = itemCount === 1 ? '件商品' : '件商品';
        
        if (confirm(`確定要結帳嗎？\n\n商品數量: ${itemCount}${itemText}\n總金額: $${total.toFixed(0)}\n\n將會向所有賣家發送購買請求`)) {
            
            // 顯示處理中狀態
            const checkoutBtn = document.querySelector('.btn-checkout');
            if (checkoutBtn) {
                checkoutBtn.disabled = true;
                checkoutBtn.textContent = '處理中...';
            }
            
            try {
                let successCount = 0;
                let failCount = 0;
                const results = [];
                
                // 批量發送購買請求
                for (const item of cartItems) {
                    try {
                        const purchaseResponse = await fetch('/api/purchase-request', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${currentToken}`
                            },
                            body: JSON.stringify({
                                product_id: item.id,
                                message: `批量結帳購買請求 - 商品：${item.title}`
                            })
                        });
                        
                        const result = await purchaseResponse.json();
                        
                        if (purchaseResponse.ok) {
                            successCount++;
                            results.push(`✅ ${item.title} - 購買請求已發送`);
                        } else {
                            failCount++;
                            results.push(`❌ ${item.title} - ${result.error}`);
                        }
                    } catch (error) {
                        failCount++;
                        results.push(`❌ ${item.title} - 網路錯誤`);
                    }
                }
                
                // 顯示結果
                const resultMessage = `結帳完成！\n\n成功: ${successCount}件\n失敗: ${failCount}件\n\n詳細結果:\n${results.join('\n')}`;
                alert(resultMessage);
                
                // 如果有成功的請求，詢問是否清空購物車
                if (successCount > 0) {
                    if (confirm('是否清空購物車？')) {
                        // 清空購物車 - 移除所有商品
                        for (const item of cartItems) {
                            try {
                                await fetch('/api/user/cart', {
                                    method: 'DELETE',
                                    headers: {
                                        'Content-Type': 'application/json',
                                        'Authorization': `Bearer ${currentToken}`
                                    },
                                    body: JSON.stringify({ productId: item.id })
                                });
                            } catch (error) {
                                console.error('清空購物車項目失敗:', error);
                            }
                        }
                        displayCartItems();
                        updateCartCount();
                    }
                }
                
            } catch (error) {
                console.error('結帳錯誤:', error);
                alert('結帳過程中發生錯誤，請稍後再試');
            } finally {
                // 恢復按鈕狀態
                const checkoutBtn = document.querySelector('.btn-checkout');
                if (checkoutBtn) {
                    checkoutBtn.disabled = false;
                    checkoutBtn.textContent = '結帳';
                }
            }
        }
    } catch (error) {
        console.error('載入購物車失敗:', error);
        alert('無法載入購物車，請稍後再試');
    }
}
// 從購物車移除商品
async function removeFromCart(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/user/cart', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert(result.message);
            // 重新載入購物車
            displayCartItems();
            updateCartCount();
        } else {
            alert(result.error || '移除失敗');
        }
        
    } catch (error) {
        console.error('移除商品失敗:', error);
        alert('移除商品失敗');
    }
}

// 從收藏中移除商品
async function removeFromFavorites(productId) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/user/favorites', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${currentToken}`
            },
            body: JSON.stringify({ productId })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            alert('已從收藏中移除');
            // 重新載入購物車
            loadCartItems();
            updateCartCount();
        } else {
            alert(result.error || '移除失敗');
        }
        
    } catch (error) {
        console.error('移除收藏失敗:', error);
        alert('移除失敗');
    }
}
// ===== 增強留言系統功能 =====

// 表情符號
const emojis = ['😀','😂','😍','👍','👎','❤️','😢','😮','😡','🤔','👏','🔥','💯','🎉','😎','🤝'];

// 顯示表情符號選擇器
function showEmojiPicker(inputId) {
    let picker = document.getElementById('emoji-picker');
    if (!picker) {
        const pickerHTML = `
            <div id="emoji-picker" class="emoji-picker">
                <div class="emoji-grid">
                    ${emojis.map(emoji => `<span class="emoji-item" onclick="insertEmoji('${emoji}', '${inputId}')">${emoji}</span>`).join('')}
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', pickerHTML);
        picker = document.getElementById('emoji-picker');
    }
    
    // 找到表情按鈕的位置
    const emojiButton = document.querySelector(`[onclick*="showEmojiPicker('${inputId}')"]`);
    const buttonRect = emojiButton.getBoundingClientRect();
    
    picker.style.display = 'block';
    picker.style.position = 'fixed';
    picker.style.left = (buttonRect.right + 5) + 'px';
    picker.style.top = buttonRect.top + 'px';
    
    // 如果右側空間不足，顯示在按鈕左側
    if (buttonRect.right + 200 > window.innerWidth) {
        picker.style.left = (buttonRect.left - 200) + 'px';
    }
}

// 插入表情符號
function insertEmoji(emoji, inputId) {
    const input = document.getElementById(inputId);
    input.value += emoji;
    document.getElementById('emoji-picker').style.display = 'none';
    input.focus();
}

// 處理內容（@提及和表情符號）
function processContent(content) {
    return content
        .replace(/@(\w+)/g, '<span class="mention">@$1</span>')
        .replace(/:\)/g, '😊')
        .replace(/:\(/g, '😢');
}

// 開始私人聊天
function startPrivateChat(userId, event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    if (userId === currentUser.id) {
        alert('不能跟自己聊天');
        return;
    }
    
    fetch('/api/conversations', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ otherUserId: userId })
    })
    .then(response => response.json())
    .then(conversation => {
        showChatWindow(conversation.id, userId);
    })
    .catch(error => console.error('創建對話失敗:', error));
}

// 顯示聊天視窗
function showChatWindow(conversationId, otherUserId, productTitle = null) {
    // 移除現有聊天視窗
    const existing = document.getElementById('chat-window');
    if (existing) existing.remove();
    
    const chatHTML = `
        <div id="chat-window" class="chat-window" data-conversation-id="${conversationId}">
            <div class="chat-header">
                <div class="chat-user-info">
                    <div id="chat-avatar">👤</div>
                    <div class="chat-title-info">
                        <span id="chat-title">載入中...</span>
                        ${productTitle ? `<span class="chat-product">關於: ${productTitle}</span>` : ''}
                    </div>
                </div>
                <button onclick="closeChatWindow()">✕</button>
            </div>
            <div id="chat-messages" class="chat-messages">載入中...</div>
            <div class="chat-input">
                <textarea id="chat-input-text" placeholder="輸入訊息..." onclick="event.stopPropagation()" onkeydown="event.stopPropagation(); if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); sendPrivateMessage(${conversationId});}" onfocus="event.stopPropagation()"></textarea>
                <button type="button" onclick="event.stopPropagation(); showEmojiPicker('chat-input-text')">😀</button>
                <button type="button" onclick="event.stopPropagation(); sendPrivateMessage(${conversationId})">發送</button>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', chatHTML);
    
    // 獲取對方用戶名並更新標題
    fetch(`/api/users/${otherUserId}`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(response => {
        if (response.ok) {
            return response.json();
        } else {
            throw new Error('用戶不存在');
        }
    })
    .then(async user => {
        // 更新頭像
        const avatarElement = document.getElementById('chat-avatar');
        if (user.avatar_url) {
            avatarElement.innerHTML = `<img src="${user.avatar_url}" class="user-avatar-small">`;
        }
        
        // 更新標題
        document.getElementById('chat-title').textContent = user.username;
    })
    .catch(error => {
        console.error('獲取用戶資訊失敗:', error);
        document.getElementById('chat-title').textContent = '私人對話';
    });
    
    loadChatMessages(conversationId);
    startChatRefresh(conversationId);
}

// 發送私人訊息
function sendPrivateMessage(conversationId) {
    const content = document.getElementById('chat-input-text').value.trim();
    if (!content) return;
    
    fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentToken}`
        },
        body: JSON.stringify({ content })
    })
    .then(response => response.json())
    .then(() => {
        document.getElementById('chat-input-text').value = '';
        loadChatMessages(conversationId);
        // 刷新通知
        loadNotifications();
        // 滾動到底部
        setTimeout(() => {
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
        }, 100);
    })
    .catch(error => console.error('發送訊息失敗:', error));
}

// 關閉聊天視窗
async function markChatAsRead(conversationId) {
    // 立即更新 UI - 移除未讀徽章
    const unreadBadges = document.querySelectorAll(`[onclick*="showChatWindow(${conversationId}"] .unread-badge`);
    unreadBadges.forEach(badge => badge.remove());
    
    try {
        const response = await fetch(`/api/conversations/${conversationId}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (response.ok) {
            // 更新通知數量
            await updateNotificationCount();
        }
    } catch (error) {
        console.error('標記聊天已讀失敗:', error);
    }
}

// 關閉聊天視窗
function closeChatWindow() {
    stopChatRefresh();
    const chatWindow = document.getElementById('chat-window');
    if (chatWindow) chatWindow.remove();
}

// 點擊外部關閉表情符號選擇器
document.addEventListener('click', (e) => {
    if (!e.target.closest('.emoji-picker') && !e.target.closest('[onclick*="showEmojiPicker"]')) {
        const picker = document.getElementById('emoji-picker');
        if (picker) picker.style.display = 'none';
    }
});

// Enter 鍵發送訊息
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        const chatInput = document.getElementById('chat-input-text');
        if (chatInput && document.activeElement === chatInput) {
            e.preventDefault();
            const conversationId = chatInput.closest('.chat-window').querySelector('[onclick*="sendPrivateMessage"]').onclick.toString().match(/\d+/)[0];
            sendPrivateMessage(parseInt(conversationId));
        }
    }
});
// 定時刷新功能
let refreshInterval;
let commentsRefreshInterval;
let chatRefreshInterval;
let currentInboxFilter = 'all'; // 記錄當前選中的標籤

function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (commentsRefreshInterval) clearInterval(commentsRefreshInterval);
    
    // 通知更新 - 每10秒
    refreshInterval = setInterval(() => {
        if (currentToken) {
            // 只在收件夾頁面時更新，並保持當前標籤
            const inboxSection = document.getElementById('inbox');
            if (inboxSection && inboxSection.style.display !== 'none') {
                loadNotifications(currentInboxFilter);
            } else {
                // 如果不在收件夾頁面，只更新通知數量
                updateNotificationCount();
            }
        }
    }, 10000);
    
    // 評論區更新 - 每60秒
    commentsRefreshInterval = setInterval(() => {
        if (currentToken) {
            const commentsSection = document.querySelector('.comments-section');
            if (commentsSection && commentsSection.style.display !== 'none') {
                const productId = commentsSection.dataset.productId;
                if (productId) {
                    loadComments(parseInt(productId));
                }
            }
        }
    }, 60000);
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
    }
    if (commentsRefreshInterval) {
        clearInterval(commentsRefreshInterval);
        commentsRefreshInterval = null;
    }
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
}

// 開始聊天更新
function startChatRefresh(conversationId) {
    if (chatRefreshInterval) clearInterval(chatRefreshInterval);
    chatRefreshInterval = setInterval(() => {
        if (currentToken) {
            const chatWindow = document.querySelector('.chat-window');
            if (chatWindow && chatWindow.style.display !== 'none') {
                loadChatMessages(conversationId);
            } else {
                stopChatRefresh();
            }
        }
    }, 1500);
}

// 停止聊天更新
function stopChatRefresh() {
    if (chatRefreshInterval) {
        clearInterval(chatRefreshInterval);
        chatRefreshInterval = null;
    }
}

// 載入評論函數
async function loadComments(productId) {
    try {
        const response = await fetch(`/api/comments/${productId}`);
        if (response.ok) {
            const comments = await response.json();
            const commentsContainer = document.getElementById('comments-container');
            if (commentsContainer) {
                const commentsHtml = await displayNestedComments(comments);
                commentsContainer.innerHTML = commentsHtml;
                
                // 更新評論數量
                const commentsSection = document.querySelector('.comments-section h3');
                if (commentsSection) {
                    commentsSection.textContent = `留言 (${comments.length})`;
                }
            }
        }
    } catch (error) {
        console.warn('載入評論失敗:', error);
    }
}

// 登入後啟動自動刷新
const originalShowLoggedInState = showLoggedInState;
showLoggedInState = function(user) {
    originalShowLoggedInState(user);
    startAutoRefresh();
};

// 登出時停止自動刷新
const originalShowLoggedOutState = showLoggedOutState;
showLoggedOutState = function() {
    originalShowLoggedOutState();
    stopAutoRefresh();
};
// 播放提示音
function playNotificationSound() {
    try {
        // 創建簡單的提示音
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        // 忽略音頻錯誤
    }
}

// 記錄上次訊息數量
let lastMessageCounts = {};

// 修改載入聊天訊息函數以支持聲音提示
loadChatMessages = function(conversationId) {
    fetch(`/api/conversations/${conversationId}/messages`, {
        headers: { 'Authorization': `Bearer ${currentToken}` }
    })
    .then(response => response.json())
    .then(messages => {
        const currentCount = messages.length;
        const lastCount = lastMessageCounts[conversationId] || 0;
        
        // 如果有新訊息且不是自己發送的
        if (currentCount > lastCount && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            if (lastMessage.senderId !== currentUser.id) {
                playNotificationSound();
            }
        }
        
        lastMessageCounts[conversationId] = currentCount;
        
        const messagesHTML = messages.map(msg => `
            <div class="chat-message ${msg.senderId === currentUser.id ? 'own' : 'other'}">
                <div class="message-content">${processContent(msg.content)}</div>
                <div class="message-time">${new Date(msg.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');
        
        document.getElementById('chat-messages').innerHTML = messagesHTML;
        
        // 自動滾動到底部
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
        
        // 標記訊息為已讀並更新通知（只調用一次）
        markChatAsRead(conversationId);
    })
    .catch(error => console.error('載入訊息失敗:', error));
};
// 個人中心自動載入監聽器
function setupProfileAutoLoad() {
    const profileSection = document.getElementById('profile');
    if (profileSection) {
        // 使用 MutationObserver 監聽個人中心顯示
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const isVisible = !profileSection.style.display || profileSection.style.display === 'block';
                    if (isVisible && currentToken) {
                        console.log('DEBUG: 檢測到個人中心顯示，自動載入商品');
                        setTimeout(() => {
                            loadUserProducts();
                        }, 100);
                    }
                }
            });
        });
        
        observer.observe(profileSection, { attributes: true });
        console.log('DEBUG: 個人中心自動載入監聽器已設置');
    }
}

// 在頁面載入完成後設置監聽器
document.addEventListener('DOMContentLoaded', setupProfileAutoLoad);
// 顯示我的商品
async function showMyProducts(buttonElement) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/user/products', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!response.ok) {
            throw new Error('載入失敗');
        }
        
        const products = await response.json();
        
        // 更新標籤樣式
        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
        if (buttonElement) buttonElement.classList.add('active');
        
        // 分離可購買和已售出的商品
        const availableProducts = products.filter(product => !product.is_sold);
        const soldProducts = products.filter(product => product.is_sold);
        
        displayProducts(availableProducts);
        displaySoldProducts(soldProducts);
        
    } catch (error) {
        console.error('載入我的商品失敗:', error);
        alert('載入我的商品失敗');
    }
}

// 顯示我的收藏
async function showMyFavorites(buttonElement) {
    if (!currentToken) {
        alert('請先登入');
        return;
    }
    
    try {
        const response = await fetch('/api/user/favorites', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (!response.ok) {
            throw new Error('載入失敗');
        }
        
        const favorites = await response.json();
        
        // 更新標籤樣式
        document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
        if (buttonElement) buttonElement.classList.add('active');
        
        // 分離可購買和已售出的商品
        const availableProducts = favorites.filter(product => !product.is_sold);
        const soldProducts = favorites.filter(product => product.is_sold);
        
        displayProducts(availableProducts);
        displaySoldProducts(soldProducts);
        
    } catch (error) {
        console.error('載入我的收藏失敗:', error);
        alert('載入我的收藏失敗');
    }
}
// 載入用戶詳細資訊
async function loadUserPanelInfo() {
    if (!currentToken) return;
    
    try {
        // 載入用戶基本資料
        const profileResponse = await fetch('/api/user/profile', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (profileResponse.ok) {
            const userData = await profileResponse.json();
            
            // 更新基本資訊
            const panelUsername = document.getElementById('panel-username');
            const panelEmail = document.getElementById('panel-user-email');
            const panelJoinDate = document.getElementById('panel-join-date');
            
            if (panelUsername) panelUsername.textContent = userData.username;
            if (panelEmail) panelEmail.textContent = userData.email;
            if (panelJoinDate && userData.created_at) {
                const joinDate = new Date(userData.created_at).toLocaleDateString('zh-TW');
                panelJoinDate.textContent = joinDate;
            }
        }
        
        // 載入統計資訊
        await loadUserStats();
        
    } catch (error) {
        console.error('載入用戶資訊失敗:', error);
    }
}

// 載入用戶統計資訊
async function loadUserStats() {
    if (!currentToken) return;
    
    try {
        // 載入用戶商品數量
        const productsResponse = await fetch('/api/user/products', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        // 載入用戶收藏數量
        const favoritesResponse = await fetch('/api/user/favorites', {
            headers: { 'Authorization': `Bearer ${currentToken}` }
        });
        
        if (productsResponse.ok && favoritesResponse.ok) {
            const userProducts = await productsResponse.json();
            const favorites = await favoritesResponse.json();
            
            // 更新側邊欄統計
            const productsCount = document.getElementById('panel-products-count');
            const favoritesCount = document.getElementById('panel-favorites-count');
            
            if (productsCount) productsCount.textContent = userProducts.length;
            if (favoritesCount) favoritesCount.textContent = favorites.length;
        }
        
    } catch (error) {
        console.error('載入用戶統計失敗:', error);
    }
}

// 顯示頭像上傳功能
function showAvatarUpload() {
    // 創建文件輸入元素
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = handleAvatarUpload;
    input.click();
}

// 處理頭像上傳
async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 檢查檔案大小 (2MB)
    if (file.size > 2 * 1024 * 1024) {
        alert('檔案大小不能超過 2MB，請選擇較小的圖片');
        return;
    }
    
    // 檢查檔案類型
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        alert('只允許上傳 JPG, PNG, GIF 格式的圖片');
        return;
    }
    
    const formData = new FormData();
    formData.append('avatar', file);
    
    try {
        const response = await fetch('/api/upload-avatar', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${currentToken}` },
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // 更新頭像顯示
            await loadUserAvatar();
            alert('頭像更新成功！');
        } else {
            alert(result.error || '頭像上傳失敗');
        }
    } catch (error) {
        console.error('頭像上傳錯誤:', error);
        alert('頭像上傳失敗');
    }
}
