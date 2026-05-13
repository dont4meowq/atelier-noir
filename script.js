// ==================== SUPABASE CONFIG ====================
const SUPABASE_URL = 'https://cjuqmzioojlswirlkvkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdXFtemlvb2psc3dpcmxrdmtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ5NzgxNzMsImV4cCI6MjA5MDU1NDE3M30.f5uci17300R7nJTFLRCD6sIp_uQzcrcBqwYpzZdpiWI';

const SB_HEADERS = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json'
};

// ==================== AUTH ====================

async function getSession() {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { ...SB_HEADERS, 'Authorization': `Bearer ${getAccessToken()}` }
    });
    if (!res.ok) return null;
    return res.json();
}

function getAccessToken() {
    const key = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        // Перевіряємо що це реальний токен а не помилка
        if (!parsed.access_token || parsed.error_code) {
            localStorage.removeItem(key);
            return null;
        }
        return parsed.access_token;
    } catch { return null; }
}

function authHeaders() {
    const token = getAccessToken();
    return token
        ? { ...SB_HEADERS, 'Authorization': `Bearer ${token}` }
        : SB_HEADERS;
}

async function signUp(email, password, firstName, lastName) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error_description || data.error?.message || data.msg || 'Registration failed');

    // Зберегти ім'я в profiles
    if (data.user) {
        await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${data.user.id}`, {
            method: 'PATCH',
            headers: { ...SB_HEADERS, 'Authorization': `Bearer ${data.access_token}` },
            body: JSON.stringify({ first_name: firstName, last_name: lastName })
        });
    }
    return data;
}

async function signIn(email, password) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok || data.error) {
        throw new Error(data.error_description || data.error || data.msg || 'Invalid email or password');
    }

    // Зберегти токен
    const key = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify(data));
    localStorage.setItem('customerEmail', email);
    return data;
}

async function signOut() {
    const token = getAccessToken();
    if (token) {
        await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
            method: 'POST',
            headers: { ...SB_HEADERS, 'Authorization': `Bearer ${token}` }
        });
    }
    const key = `sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`;
    localStorage.removeItem(key);
    localStorage.removeItem('customerEmail');
}

async function updateNavAuth() {
    const token = getAccessToken();
    const accountLinks = document.querySelectorAll('a[href="account.html"]');
    if (token) {
        accountLinks.forEach(el => el.textContent = '👤✓');
    } else {
        accountLinks.forEach(el => { el.textContent = '👤'; });
    }
}

// ==================== SUPABASE API ====================

async function fetchAllProducts() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?order=id.asc`, { headers: SB_HEADERS });
    return res.json();
}

async function fetchProductById(id) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}&limit=1`, { headers: SB_HEADERS });
    const data = await res.json();
    return data[0] || null;
}

async function fetchNewArrivals() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?badge=eq.NEW`, { headers: SB_HEADERS });
    return res.json();
}

async function fetchProductsByIds(ids) {
    const list = ids.join(',');
    const res = await fetch(`${SUPABASE_URL}/rest/v1/products?id=in.(${list})`, { headers: SB_HEADERS });
    return res.json();
}

async function searchProducts(query, category) {
    let url = `${SUPABASE_URL}/rest/v1/products?`;
    const params = [];
    if (category && category !== 'ALL') {
        params.push(`category=eq.${encodeURIComponent(category)}`);
    }
    if (query) {
        const q = encodeURIComponent(`%${query}%`);
        params.push(`or=(name.ilike.${q},description.ilike.${q})`);
    }
    params.push('order=id.asc');
    const res = await fetch(url + params.join('&'), { headers: SB_HEADERS });
    return res.json();
}

// ==================== CART ====================

let cart = JSON.parse(localStorage.getItem('cart')) || [];

function updateCartCount() {
    const total = cart.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelectorAll('.cart-count').forEach(el => el.textContent = total);
}

function addToCart(product) {
    const productId = product.id;
    const size = product.selectedSize || null;
    const color = product.selectedColor || null;

    const existing = cart.find(item =>
        item.id === productId &&
        (item.selectedSize || null) === size &&
        (item.selectedColor || null) === color
    );

    if (existing) {
        existing.quantity += product.quantity || 1;
    } else {
        const item = {
            id: productId,
            name: product.name,
            price: product.price,
            image: product.image,
            category: product.category,
            quantity: product.quantity || 1
        };
        if (size) item.selectedSize = size;
        if (color) item.selectedColor = color;
        cart.push(item);
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    showNotification('Item added to cart!');
}

function removeFromCart(productId, size, color) {
    const nSize = (size && size !== 'null' && size !== 'undefined') ? size : null;
    const nColor = (color && color !== 'null' && color !== 'undefined') ? color : null;

    cart = cart.filter(item => !(
        item.id === productId &&
        (item.selectedSize || null) === nSize &&
        (item.selectedColor || null) === nColor
    ));

    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartCount();
    if (typeof renderCart === 'function') renderCart();
}

function updateCartItemQuantity(productId, quantity, size, color) {
    const nSize = (size && size !== 'null' && size !== 'undefined') ? size : null;
    const nColor = (color && color !== 'null' && color !== 'undefined') ? color : null;

    const item = cart.find(i =>
        i.id === productId &&
        (i.selectedSize || null) === nSize &&
        (i.selectedColor || null) === nColor
    );

    if (item) {
        item.quantity = parseInt(quantity);
        if (item.quantity <= 0) {
            removeFromCart(productId, size, color);
        } else {
            localStorage.setItem('cart', JSON.stringify(cart));
            if (typeof renderCart === 'function') renderCart();
        }
    }
}

// ==================== WISHLIST ====================

function toggleWishlist(productId) {
    let wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
    if (wishlist.includes(productId)) {
        wishlist = wishlist.filter(id => id !== productId);
        showNotification('Removed from wishlist');
    } else {
        wishlist.push(productId);
        showNotification('Added to wishlist');
    }
    localStorage.setItem('wishlist', JSON.stringify(wishlist));
    updateWishlistButtons();
}

function isInWishlist(productId) {
    return JSON.parse(localStorage.getItem('wishlist') || '[]').includes(productId);
}

function updateWishlistButtons() {
    document.querySelectorAll('.wishlist-btn').forEach(btn => {
        const id = parseInt(btn.dataset.productId);
        btn.innerHTML = isInWishlist(id) ? '❤️' : '🤍';
        btn.classList.toggle('active', isInWishlist(id));
    });
}

// ==================== NOTIFICATIONS ====================

function showNotification(message) {
    const n = document.createElement('div');
    n.style.cssText = `
        position: fixed; top: 100px; right: 20px;
        background: #0a0a0a; color: #f8f7f4;
        padding: 1rem 2rem; border-radius: 4px;
        z-index: 10000; animation: notifySlideIn 0.3s ease;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    `;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.animation = 'notifySlideOut 0.3s ease';
        setTimeout(() => n.remove(), 300);
    }, 2000);
}

const _style = document.createElement('style');
_style.textContent = `
    @keyframes notifySlideIn {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);    opacity: 1; }
    }
    @keyframes notifySlideOut {
        from { transform: translateX(0);    opacity: 1; }
        to   { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(_style);

// ==================== SCROLL ANIMATION ====================

const observer = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

// ==================== RENDER ====================

function renderProductCard(product) {
    const outOfStock = product.stock === 0;
    const lowStock = product.stock > 0 && product.stock <= 3;
    return `
        <div class="product-card fade-in-on-scroll ${outOfStock ? 'out-of-stock-card' : ''}"
             onclick="${outOfStock ? '' : `window.location.href='product-detail.html?id=${product.id}'`}"
             style="${outOfStock ? 'cursor:default;' : ''}">
            <div class="product-image-wrapper">
                <img src="${product.image}" alt="${product.name}" class="product-image"
                     style="object-fit:cover;${outOfStock ? 'filter:grayscale(60%);opacity:0.7;' : ''}">
                ${outOfStock
                    ? '<span class="product-badge" style="background:#888;">OUT OF STOCK</span>'
                    : product.badge ? `<span class="product-badge">${product.badge}</span>` : ''
                }
                ${lowStock ? `<span class="stock-warning">Only ${product.stock} left</span>` : ''}
            </div>
            <div class="product-info">
                <p class="product-category">${product.category}</p>
                <h3 class="product-name">${product.name}</h3>
                <p class="product-price">$${product.price}</p>
            </div>
        </div>
    `;
}

async function renderHomeProducts() {
    const container = document.getElementById('home-products-grid');
    if (!container) return;
    const products = await fetchAllProducts();
    container.innerHTML = products.slice(0, 8).map(renderProductCard).join('');
    container.querySelectorAll('.fade-in-on-scroll').forEach(el => observer.observe(el));
}

async function renderNewArrivals() {
    const container = document.getElementById('new-arrivals-grid');
    if (!container) return;
    const products = await fetchNewArrivals();
    container.innerHTML = products.map(renderProductCard).join('');
    container.querySelectorAll('.fade-in-on-scroll').forEach(el => observer.observe(el));
}

async function renderRelatedProducts(currentId, category) {
    const container = document.getElementById('related-products-grid');
    if (!container) return;
    const all = await fetchAllProducts();
    const related = all.filter(p => p.category === category && p.id !== currentId).slice(0, 4);
    container.innerHTML = related.map(renderProductCard).join('');
    container.querySelectorAll('.fade-in-on-scroll').forEach(el => el.classList.add('visible'));
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    updateCartCount();
    updateWishlistButtons();

    document.querySelectorAll('.fade-in-on-scroll').forEach(el => observer.observe(el));

    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (href !== '#') {
                e.preventDefault();
                document.querySelector(href)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.classList.toggle('active', link.getAttribute('href') === currentPage);
    });

    if (currentPage === 'index.html' || currentPage === '') {
        renderHomeProducts();
    } else if (currentPage === 'new-arrivals.html') {
        renderNewArrivals();
    }
});
