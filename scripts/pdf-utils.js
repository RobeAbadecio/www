(function(){
    if (typeof window !== 'undefined' && window.fetch) {
        const _fetch = window.fetch.bind(window);
        window.fetch = function(input, init){ init = init || {}; if (!('cache' in init)) init.cache = 'no-store'; return _fetch(input, init); };
    }
})();

function generatePDFHTML(record) {
    const events = record.events_json ? JSON.parse(record.events_json) : [];
    const eventsHTML = events.map((e, i) => `
        <div style="margin:15px 0;padding:10px;background:#f9f9f9;border-left:3px solid #004080">
            <div class="label">Event ${i + 1}: ${e.name || 'N/A'}</div>
            <div class="value">Date: ${e.date || 'N/A'} | Venue: ${e.venue || 'N/A'}</div>
            <div class="value">Participants: ${e.participants || 'N/A'} | Budget: ₱${e.budget || 'N/A'}</div>
            <div class="value">Description: ${e.description || 'N/A'}</div>
        </div>
    `).join('');
    
    return `<!DOCTYPE html>
<html><head><title>${record.submission_title}</title>
<style>
    body{font-family:Arial,sans-serif;padding:40px;max-width:900px;margin:0 auto;line-height:1.6}
    h1{color:#004080;border-bottom:3px solid #004080;padding-bottom:10px;margin-bottom:20px}
    h2{color:#004080;margin-top:25px;border-bottom:1px solid #ddd;padding-bottom:5px}
    .label{font-weight:bold;color:#555;margin-top:10px}
    .value{margin:5px 0 10px 15px}
    @media print{body{padding:20px}}
</style></head><body>
<h1>${record.submission_title || 'Submission Form'}</h1>

<h2>Organization Information</h2>
<div class="label">Organization Name:</div><div class="value">${record.org_name || 'N/A'}</div>
<div class="label">Acronym:</div><div class="value">${record.org_acronym || 'N/A'}</div>
<div class="label">Email:</div><div class="value">${record.org_email || 'N/A'}</div>
<div class="label">Social Media:</div><div class="value">${record.social_media || 'N/A'}</div>
<div class="label">School:</div><div class="value">${record.organization_school || 'N/A'}</div>
<div class="label">Type:</div><div class="value">${record.organization_type || 'N/A'}</div>

<h2>Applicant Information</h2>
<div class="label">Name:</div><div class="value">${record.applicant_name || 'N/A'}</div>
<div class="label">Position:</div><div class="value">${record.applicant_position || 'N/A'}</div>
<div class="label">Email:</div><div class="value">${record.applicant_email || 'N/A'}</div>

<h2>Adviser Information</h2>
<div class="label">Name(s):</div><div class="value">${record.adviser_names || 'N/A'}</div>
<div class="label">Email(s):</div><div class="value">${record.adviser_emails || 'N/A'}</div>

<h2>Events</h2>
${eventsHTML || '<div class="value">No events listed</div>'}

<div style="margin-top:30px;padding-top:10px;border-top:1px solid #ddd;color:#777;font-size:12px">
    Submitted: ${record.created_at || 'N/A'}
</div>
</body></html>`;
}
