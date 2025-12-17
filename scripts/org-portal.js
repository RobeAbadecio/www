(function(){
    if (typeof window === 'undefined' || !window.fetch) return;
    const _fetch = window.fetch.bind(window);
    window.fetch = function(input, init){ init = init || {}; if (!('cache' in init)) init.cache = 'no-store'; return _fetch(input, init); };
})();

function checkAuth() {
    return fetch('/api/logout.php')
        .then(res => res.json())
        .then(data => {
            if (!data.logged_in || data.user.type !== 'org') {
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

document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger-toggle');
    const sidebar = document.getElementById('sidebar');

    if (hamburger && sidebar) hamburger.addEventListener('click', () => sidebar.classList.toggle('active'));

    displayUserInfo();
    loadSubmissions();
    setInterval(loadSubmissions, 10000);
});

function displayUserInfo() {
    const userName = sessionStorage.getItem('userName') || 'User';
    document.getElementById('user-name').textContent = userName;
}

function submitForm(event) {
    event.preventDefault();

    const formData = new FormData();
    formData.append('submission_title', document.getElementById('submission_title')?.value || '');
    formData.append('org_name', document.getElementById('org_full_name')?.value || '');
    formData.append('org_acronym', document.getElementById('org_acronym')?.value || '');
    formData.append('org_email', document.getElementById('org_email')?.value || '');
    formData.append('social_media', document.getElementById('social_media_links')?.value || '');
    formData.append('applicant_name', document.getElementById('applicant_name')?.value || '');
    formData.append('applicant_position', document.getElementById('applicant_position')?.value || '');
    formData.append('applicant_email', document.getElementById('applicant_email')?.value || '');
    formData.append('adviser_names', document.getElementById('adviser_names')?.value || '');
    formData.append('adviser_emails', document.getElementById('adviser_emails')?.value || '');
    formData.append('organization_school', Array.from(document.querySelectorAll('input[name="category"]:checked')).map(c => c.value).join(','));
    formData.append('organization_type', document.querySelector('input[name="org_type"]:checked')?.value || '');

    const events = Array.from(document.querySelectorAll('.event-section')).map(event => ({
        name: event.querySelector('[name="event_name[]"]').value || '',
        date: event.querySelector('[name="event_date[]"]').value || '',
        venue: event.querySelector('[name="event_venue[]"]').value || '',
        description: event.querySelector('[name="event_description[]"]').value || '',
        participants: event.querySelector('[name="event_participants[]"]').value || '',
        budget: event.querySelector('[name="event_budget[]"]').value || ''
    }));
    formData.append('events', JSON.stringify(events));

    const fileInput = document.getElementById('uploaded_file');
    if (fileInput?.files[0]) formData.append('file', fileInput.files[0]);

    fetch('/api/submit.php', {
        method: 'POST',
        body: formData
    })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                alert('Form submitted successfully!');
                loadSubmissions();
                if (typeof showTab === 'function') showTab('submissions');
            } else {
                alert('Error: ' + data.message);
            }
        })
        .catch(() => alert('Failed to submit form'));
}

function clearForm() {
    if (confirm('Clear all form data?')) {
        const form = document.getElementById('orgSubmissionForm');
        if (form) form.reset();
    }
}

let allRecords = [];

function loadSubmissions() {
    fetch('/api/read.php')
        .then(response => response.json())
        .then(data => {
            if (data.success && data.records) {
                allRecords = data.records;
                displayRecords(data.records);
            }
        })
        .catch(() => console.error('Failed to load submissions'));
}

function displayRecords(records) {
    const tbody = document.querySelector('.submissions-table tbody');
    tbody.innerHTML = records.map(record => `
        <tr>
            <td>${record.org_name || ''}</td>
            <td>${record.submission_title || ''}</td>
            <td>${record.applicant_name || ''}</td>
            <td>${record.created_at}</td>
            <td>
                <button onclick="viewPDF(${record.id})" style="padding:5px 10px;margin-right:5px;background:#004080;color:white;border:none;border-radius:4px;cursor:pointer">View</button>
            </td>
            ${record.file_path ? `<td>
                <button onclick="window.open('/uploads/${record.file_path}', '_blank')" style="padding:5px 10px;background:#28a745;color:white;border:none;border-radius:4px;cursor:pointer">Open File</button>
            </td>` : ''}
        </tr>
    `).join('');
}

function addEvent() {
    const container = document.querySelector('.event-section');
    const newEvent = document.createElement('div');
    newEvent.className = 'event-item';
    newEvent.innerHTML = `
        <hr style="margin: 20px 0; border: none; border-top: 2px solid #ddd;">
        <div class="form-group">
            <label class="form-label form-label--required">Name of the Event</label>
            <input type="text" class="form-input" name="event_name[]" required placeholder="e.g. Annual General Assembly, Fundraising Drive">
        </div>
        <div class="form-group">
            <label class="form-label form-label--required">Event Date</label>
            <input type="date" class="form-input" name="event_date[]" required>
        </div>
        <div class="form-group">
            <label class="form-label form-label--required">Event Venue</label>
            <input type="text" class="form-input" name="event_venue[]" required placeholder="e.g. Main Auditorium, Conference Room">
        </div>
        <div class="form-group">
            <label class="form-label form-label--required">Event Description</label>
            <textarea class="form-input" name="event_description[]" required placeholder="Provide a brief description of the event"></textarea>
        </div>
        <div class="form-group">
            <label class="form-label form-label--required">Expected Number of Participants</label>
            <input type="number" class="form-input" name="event_participants[]" required placeholder="e.g. 50, 100">
        </div>
        <div class="form-group">
            <label class="form-label form-label--required">Budget Estimate (PHP)</label>
            <input type="number" class="form-input" name="event_budget[]" required placeholder="e.g. 5000, 10000">
        </div>
        <button type="button" class="btn btn--danger" onclick="this.parentElement.remove()" style="margin-top: 10px;">Remove Event</button>
    `;

    const addButton = container.querySelector('.event-actions');
    container.insertBefore(newEvent, addButton);
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


