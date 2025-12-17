(function(){
    if (typeof window === 'undefined' || !window.fetch) return;
    const _fetch = window.fetch.bind(window);
    window.fetch = function(input, init){ init = init || {}; if (!('cache' in init)) init.cache = 'no-store'; return _fetch(input, init); };
})();

function checkAuth() {
    return fetch('/api/logout.php')
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in || data.user.type !== 'osa') {
                window.location.replace('/index.html');
                return false;
            }
            sessionStorage.setItem('userEmail', data.user.email);
            sessionStorage.setItem('userType', data.user.type);
            sessionStorage.setItem('userName', data.user.name);
            return true;
        })
        .catch(() => {
            window.location.replace('/index.html');
            return false;
        });
}

checkAuth();
window.addEventListener('pageshow', (event) => { if (event.persisted) checkAuth(); });

setInterval(() => {
    fetch('/api/check-session.php')
        .then(res => res.json())
        .then(data => {
            if (data.force_logout) {
                sessionStorage.clear();
                alert('You have been logged out because this account was logged in from another device.');
                window.location.replace('/index.html');
            }
        })
        .catch(() => {});
}, 5000);

function handleLogout() {
    fetch('/api/logout.php', { method: 'POST' })
        .then(() => {
            sessionStorage.clear();
            window.location.replace('/index.html');
        })
        .catch(() => window.location.replace('/index.html'));
}

let formRecords = [];

function loadSubmissions() {
    fetch('/api/read.php')
        .then(response => response.json())
        .then(data => {
            const tbody = document.querySelector('.form-table tbody');
            if (data.success && data.records) {
                formRecords = data.records;
                displayForms(data.records);
            }
        });
}

function displayForms(data) {
    const tbody = document.querySelector('.form-table tbody');
    tbody.innerHTML = data.map(record => `
                    <tr>
                        <td>${record.submission_title || ''}</td>
                        <td>${record.org_name || ''}</td>
                        <td>${record.applicant_name || ''}</td>
                        <td>${record.created_at || ''}</td>
                        <td>${record.organization_school || ''}</td>
                        <td>
                            <button onclick="viewPDF(${record.id})" style="padding:5px 10px;margin-right:5px;background:#004080;color:white;border:none;border-radius:4px;cursor:pointer">View</button>
                        </td>
                    </tr>
                `).join('');
}

let allDocuments = [];
function loadDocuments() {
    fetch('/api/read.php')
        .then(response => response.json())
        .then(data => {
            const tbody = document.getElementById('documents-table-body');
            if (tbody && data.success && data.records) {
                allDocuments = data.records;
                displayDocuments(data.records);
            }
        });
}

function displayDocuments(data) {
    const tbody = document.getElementById('documents-table-body');
    const withFiles = data.filter(withFile => withFile.file_path);
    tbody.innerHTML = withFiles.map(record => `
                    <tr>
                        <td>${record.org_name || 'Document'}</td>
                        <td>${record.submission_title || ''}</td>
                        <td>${record.organization_school || ''}</td>
                        <td>${record.created_at || ''}</td>
                        <td>${record.file_path || 'N/A'}</td>
                        <td>
                            <button onclick="window.open('/uploads/${record.file_path}', '_blank')" style="padding:5px 10px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer">Open File</button>
                        </td>
                    </tr>
                `).join('');
}

function viewPDF(id) {
    fetch(`/api/read.php?id=${id}`)
        .then(r => r.json())
        .then(data => {
            if (data.success && data.record) {
                const win = window.open('', '_blank');
                win.document.write(generatePDFHTML(data.record));
                win.document.close();
                win.print();
            }
        });
}

function refreshDocuments() {
    loadDocuments();
}

document.addEventListener('DOMContentLoaded', () => {
    // Hamburger menu toggle
    const hamburger = document.getElementById('hamburger-toggle');
    const sidebar = document.getElementById('navigation-sidebar');
    
    if (hamburger && sidebar) {
        hamburger.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            hamburger.classList.toggle('active');
        });
    }

    loadSubmissions();
    loadDocuments();

    setInterval(loadSubmissions, 10000);
});
