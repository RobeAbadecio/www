function checkAdminAuth() {
    return fetch('/api/admin/session', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in || data.user.type !== 'admin') {
                window.location.replace('admin-login.html');
                return false;
            }
            Object.entries({userEmail: data.user.email, userType: data.user.type, userName: data.user.name})
                .forEach(([k, v]) => sessionStorage.setItem(k, v));
            return true;
        })
        .catch(() => { window.location.replace('admin-login.html'); return false; });
}

checkAdminAuth();
window.addEventListener('pageshow', (event) => { if (event.persisted) checkAdminAuth(); });

setInterval(() => {
    fetch('/api/admin/session-check', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.force_logout) {
                sessionStorage.clear();
                alert('You have been logged out because this account was logged in from another device.');
                window.location.replace('admin-login.html');
            }
        })
        .catch(() => {});
}, 5000);

function handleLogout() {
    fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
        .then(() => {
            sessionStorage.clear();
            window.location.replace('admin-login.html');
        })
        .catch(() => window.location.replace('admin-login.html'));
}

let allAccounts = [];

document.addEventListener('DOMContentLoaded', () => {
    loadAccounts();
    setInterval(loadAccounts, 10000);
    
    const searchInput = document.getElementById('online-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allAccounts.filter(a => 
                (a.name || '').toLowerCase().includes(query) || 
                a.email.toLowerCase().includes(query)
            );
            displayAccounts(filtered);
        });
    }
});

function loadAccounts() {
    fetch('/api/admin/accounts', { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
            if (data.success && data.accounts) {
                allAccounts = data.accounts;
                displayAccounts(allAccounts);
                updateStats(allAccounts);
            }
        });
}

function displayAccounts(accounts) {
    const tbody = document.getElementById('online-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = accounts.map(account => {
        const type = account.user_type === 'admin' ? 'Admin' : account.user_type === 'osa' ? 'OSA' : 'Organization';
        const lastActivity = account.last_activity ? new Date(account.last_activity).toLocaleString() : 'Never';
        const isOnline = account.status == 1;
        const statusClass = isOnline ? 'online' : 'status-offline';
        const statusText = isOnline ? 'Online' : 'Offline';
        
        return `<tr>
            <td>${type}</td>
            <td>${account.name || 'N/A'}</td>
            <td>${account.email}</td>
            <td>${lastActivity}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        </tr>`;
    }).join('');
}

function updateStats(accounts) {
    const online = accounts.filter(a => a.status == 1);
    document.getElementById('online-orgs').textContent = online.filter(a => a.user_type === 'org').length;
    document.getElementById('online-osa').textContent = online.filter(a => a.user_type === 'osa').length;
    document.getElementById('total-users').textContent = accounts.length;
}

function refreshData() {
    loadAccounts();
}
