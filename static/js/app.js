
const $ = s => document.querySelector(s);

let records = [];
let samples = [];
let charts = {};

const advanced = [
    'relative_position_r',
    'relative_position_t',
    'relative_position_n',
    'relative_velocity_r',
    'relative_velocity_t',
    'relative_velocity_n',
    't_sigma_t',
    't_sigma_n',
    'c_sigma_t',
    'c_sigma_n'
];

// ==========================================
// PAGE NAVIGATION
// ==========================================

function nav(page) {
    document.querySelectorAll('.page').forEach(e =>
        e.classList.toggle('active', e.id === page)
    );

    document.querySelectorAll('.nav').forEach(e =>
        e.classList.toggle('active', e.dataset.page === page)
    );

    const names = {
        overview: 'Mission Overview',
        predict: 'Risk Prediction',
        monitor: 'Satellite Monitor',
        analytics: 'Risk Analytics',
        history: 'Prediction History',
        about: 'About & Model'
    };

    $('#pageTitle').textContent = names[page];
    $('#breadcrumb').textContent = names[page].toUpperCase();

    if (page === 'analytics') renderCharts();
    if (page === 'monitor') setTimeout(() => earthResize(), 80);

    window.scrollTo(0, 0);
}

document.querySelectorAll('[data-page]').forEach(e =>
    e.addEventListener('click', () => nav(e.dataset.page))
);

// ==========================================
// ADVANCED ORBITAL INPUT FIELDS
// ==========================================

for (const f of advanced) {
    const label = document.createElement('label');
    label.textContent = f.replaceAll('_', ' ');

    const input = document.createElement('input');
    input.name = f;
    input.type = 'number';
    input.step = 'any';
    input.placeholder = 'Optional';

    label.appendChild(input);
    $('#advancedFields').appendChild(label);
}

// ==========================================
// API REQUEST HANDLER
// ==========================================

async function api(path, opts) {
    const response = await fetch(path, {
        cache: 'no-store',
        ...opts
    });

    let data;

    try {
        data = await response.json();
    } catch (error) {
        throw new Error('Server returned an invalid response.');
    }

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

function fmtProb(p) {
    return Number(p).toExponential(3);
}

function badge(c) {
    return `<span class="pill ${c}">${c}</span>`;
}

function esc(s) {
    return String(s).replace(/[&<>"']/g, x => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[x]));
}

// ==========================================
// PREDICTION HISTORY AND DASHBOARD
// ==========================================

async function refresh() {
    try {
        const data = await api('/api/history');
        records = data.history || [];

        $('#recent').innerHTML = records.length
            ? records.slice(0, 4).map(r => `
                <div class="record">
                    <div>
                        <b>${esc(r.event_name)}</b>
                        <small>${new Date(r.created_at).toLocaleString()}</small>
                    </div>
                    ${badge(r.category)}
                </div>
            `).join('')
            : '<p class="muted">No predictions yet. Run your first assessment.</p>';

        $('#historyRows').innerHTML = records.length
            ? records.map(r => `
                <tr>
                    <td>${esc(new Date(r.created_at).toLocaleString())}</td>
                    <td>${esc(r.event_name)}</td>
                    <td>${Number(r.log_risk).toFixed(4)}</td>
                    <td>${fmtProb(r.probability)}</td>
                    <td>${badge(r.category)}</td>
                </tr>
            `).join('')
            : '<tr><td colspan="5">No predictions yet.</td></tr>';

        $('#totalPredictions').textContent = records.length;

        for (const [id, category] of [
            ['lowCount', 'LOW'],
            ['watchCount', 'WATCH'],
            ['elevatedCount', 'ELEVATED']
        ]) {
            $('#' + id).textContent =
                records.filter(r => r.category === category).length;
        }

        renderCharts();

    } catch (error) {
        console.warn('Unable to refresh dashboard:', error);
    }
}

// ==========================================
// INITIALIZE WEBSITE
// ==========================================

async function initialize() {
    try {
        const status = await api('/api/status');

        $('#modelStatus').textContent =
            status.ready ? 'READY' : 'SETUP';

        $('#modelBadge').textContent =
            status.ready ? '● MODEL ONLINE' : '● TRAINING REQUIRED';

        $('#modelBadge').classList.toggle('ready', status.ready);

        if (status.metrics) {
            $('#metrics').innerHTML = `
                <div class="result-info">
                    <span>Model</span>
                    <b>${esc(status.metrics.model)}</b>
                </div>
                <div class="result-info">
                    <span>Eligible events</span>
                    <b>${Number(status.metrics.eligible_events).toLocaleString()}</b>
                </div>
                <div class="result-info">
                    <span>Validation events</span>
                    <b>${Number(status.metrics.validation_events).toLocaleString()}</b>
                </div>
                <div class="result-info">
                    <span>MAE (log10 risk)</span>
                    <b>${status.metrics.mae_log10_risk}</b>
                </div>
                <div class="result-info">
                    <span>RMSE (log10 risk)</span>
                    <b>${status.metrics.rmse_log10_risk}</b>
                </div>
            `;
        }

    } catch (error) {
        console.warn('Unable to load model status:', error);
    }

    // Load examples independently so status errors
    // do not prevent the example button from working.
    try {
        const data = await api('/api/samples');
        samples = Array.isArray(data.samples) ? data.samples : [];
        console.log('ESA examples loaded:', samples.length);
    } catch (error) {
        console.warn('Initial ESA example loading failed:', error);
    }

    await refresh();
}

// ==========================================
// FIXED: LOAD REAL ESA EXAMPLE
// ==========================================

$('#loadSample').addEventListener('click', async () => {
    const button = $('#loadSample');
    const originalText = button.textContent;

    button.disabled = true;
    button.textContent = 'Loading ESA example...';

    try {
        // Always request fresh examples from Flask.
        const data = await api('/api/samples');

        const examples = Array.isArray(data.samples)
            ? data.samples
            : [];

        if (examples.length === 0) {
            alert('No ESA example encounters are available.');
            return;
        }

        samples = examples;

        // Choose a random real ESA encounter.
        const sample =
            samples[Math.floor(Math.random() * samples.length)];

        // Clear optional fields to prevent values from
        // a previous example affecting this prediction.
        for (const field of advanced) {
            const input = document.querySelector(
                `[name="${field}"]`
            );

            if (input) input.value = '';
        }

        // Fill all available orbital measurements.
        for (const [key, value] of Object.entries(sample)) {
            const input = document.querySelector(
                `[name="${key}"]`
            );

            if (input && value !== null && value !== undefined) {
                input.value = value;
            }
        }

        const eventName = document.querySelector(
            '[name="event_name"]'
        );

        if (eventName) {
            eventName.value = 'ESA event ' + sample.event_id;
        }

        console.log('Loaded ESA encounter:', sample.event_id);

    } catch (error) {
        console.error('ESA example loading error:', error);

        alert(
            'Unable to load ESA examples: ' + error.message
        );

    } finally {
        button.disabled = false;
        button.textContent = originalText;
    }
});

// ==========================================
// ML COLLISION RISK PREDICTION
// ==========================================

$('#predictionForm').addEventListener('submit', async event => {
    event.preventDefault();

    const form = event.target;
    const button = form.querySelector('[type="submit"]');

    button.disabled = true;
    button.textContent = 'Analyzing...';

    const inputs = {};

    new FormData(form).forEach((value, key) => {
        if (value !== '') {
            inputs[key] = key === 'event_name'
                ? value
                : Number(value);
        }
    });

    try {
        const result = await api('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(inputs)
        });

        $('#result').innerHTML = `
            <span class="tag">● ANALYSIS COMPLETE</span>

            <h3 style="margin-top:25px">
                ${esc(result.event_name)}
            </h3>

            <div class="result-score">
                ${esc(result.category)}
            </div>

            <div class="result-info">
                <span>Predicted final log10 risk</span>
                <b>${Number(result.log_risk).toFixed(4)}</b>
            </div>

            <div class="result-info">
                <span>Estimated collision probability</span>
                <b>${fmtProb(result.probability)}</b>
            </div>

            <div class="result-info">
                <span>Probability as percentage</span>
                <b>${(result.probability * 100).toPrecision(4)}%</b>
            </div>

            <p class="disclaimer">
                ${esc(result.disclaimer)}
                The category uses educational display bands,
                not official ESA action thresholds.
            </p>
        `;

        await refresh();

    } catch (error) {
        $('#result').innerHTML = `
            <div class="empty-result">
                <h3>Unable to Predict</h3>
                <p>${esc(error.message)}</p>
            </div>
        `;

    } finally {
        button.disabled = false;
        button.textContent = 'Analyze Collision Risk ↗';
    }
});

// ==========================================
// RISK ANALYTICS CHARTS
// ==========================================

function renderCharts() {
    if (typeof Chart === 'undefined') return;

    for (const chart of Object.values(charts)) {
        chart.destroy();
    }

    charts = {};

    const palette = {
        LOW: '#45d9a7',
        WATCH: '#ffd177',
        ELEVATED: '#ff6e99'
    };

    const categories = ['LOW', 'WATCH', 'ELEVATED'];

    const counts = categories.map(category =>
        records.filter(r => r.category === category).length
    );

    const hasRecords = counts.some(Boolean);

    charts.risk = new Chart($('#riskChart'), {
        type: 'doughnut',

        data: {
            labels: ['Low', 'Watch', 'Elevated'],

            datasets: [{
                data: hasRecords ? counts : [1, 1, 1],

                backgroundColor: hasRecords
                    ? Object.values(palette)
                    : ['#1a3043', '#1a3043', '#1a3043'],

                borderWidth: 0
            }]
        },

        options: {
            maintainAspectRatio: false,

            plugins: {
                legend: {
                    position: 'bottom',

                    labels: {
                        color: '#a9bad1',
                        padding: 18
                    }
                }
            }
        }
    });

    const trendData = records.slice(0, 20).reverse();

    charts.trend = new Chart($('#trendChart'), {
        type: 'line',

        data: {
            labels: trendData.map((_, index) => index + 1),

            datasets: [{
                label: 'Predicted log10 risk',

                data: trendData.map(r => r.log_risk),

                borderColor: '#45e5f4',
                backgroundColor: '#45e5f41a',

                fill: true,
                tension: 0.35
            }]
        },

        options: {
            maintainAspectRatio: false,

            scales: {
                x: {
                    ticks: { color: '#8596b2' },
                    grid: { color: '#1d2b43' }
                },

                y: {
                    ticks: { color: '#8596b2' },
                    grid: { color: '#1d2b43' }
                }
            },

            plugins: {
                legend: {
                    labels: {
                        color: '#a9bad1'
                    }
                }
            }
        }
    });
}

// ==========================================
// 3D EARTH AND SATELLITE MONITOR
// Illustrative visualization only.
// No live orbital tracking or ephemeris feed.
// ==========================================

let scenes = [];

function buildEarth(id, large) {
    const root = document.getElementById(id);

    if (!root || typeof THREE === 'undefined') return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
        43, 1, 0.1, 100
    );

    const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true
    });

    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
    );

    root.appendChild(renderer.domElement);

    camera.position.set(0, 0, large ? 7 : 7.6);

    const globe = new THREE.Group();
    scene.add(globe);

    // Earth sphere
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.05, 64, 64),

        new THREE.MeshPhongMaterial({
            color: 0x153c74,
            emissive: 0x071a36,
            shininess: 65,
            specular: 0x4caaff
        })
    );

    globe.add(sphere);

    // Wireframe
    const wire = new THREE.Mesh(
        new THREE.SphereGeometry(2.065, 28, 20),

        new THREE.MeshBasicMaterial({
            color: 0x36c1e9,
            wireframe: true,
            transparent: true,
            opacity: 0.12
        })
    );

    globe.add(wire);

    // Atmosphere
    const atmosphere = new THREE.Mesh(
        new THREE.SphereGeometry(2.2, 48, 48),

        new THREE.MeshBasicMaterial({
            color: 0x2c9ef6,
            transparent: true,
            opacity: 0.075,
            side: THREE.BackSide
        })
    );

    globe.add(atmosphere);

    // Lighting
    scene.add(
        new THREE.AmbientLight(0x537ab7, 1.6)
    );

    const light = new THREE.DirectionalLight(
        0x92dfff, 2.7
    );

    light.position.set(5, 3, 7);
    scene.add(light);

    // Earth surface dots
    const dots = [];

    for (let i = 0; i < 450; i++) {
        const lat = Math.asin(Math.random() * 2 - 1);
        const lon = Math.random() * Math.PI * 2;

        const point = new THREE.Vector3(
            2.085 * Math.cos(lat) * Math.cos(lon),
            2.085 * Math.sin(lat),
            2.085 * Math.cos(lat) * Math.sin(lon)
        );

        dots.push(point.x, point.y, point.z);
    }

    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(dots, 3)
    );

    globe.add(
        new THREE.Points(
            geometry,
            new THREE.PointsMaterial({
                color: 0x7de7ff,
                size: 0.025
            })
        )
    );

    // Satellite orbit paths
    const satellites = [];

    for (let i = 0; i < 3; i++) {
        const radius = 2.65 + i * 0.25;
        const angle = i * Math.PI / 3;

        const orbit = new THREE.Group();

        orbit.rotation.x = 0.35 + i * 0.3;
        orbit.rotation.y = i * 0.8;

        scene.add(orbit);

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(
                radius, 0.008, 4, 160
            ),

            new THREE.MeshBasicMaterial({
                color: i === 1
                    ? 0x9d83ff
                    : 0x41d8ef,

                transparent: true,
                opacity: 0.38
            })
        );

        orbit.add(ring);

        const dot = new THREE.Mesh(
            new THREE.SphereGeometry(
                0.055, 10, 10
            ),

            new THREE.MeshBasicMaterial({
                color: i === 1
                    ? 0xb59aff
                    : 0x65e9ff
            })
        );

        orbit.add(dot);

        satellites.push({
            dot,
            orbit,
            radius,
            angle
        });
    }

    // Background stars
    const stars = [];

    for (let i = 0; i < 250; i++) {
        stars.push(
            (Math.random() - 0.5) * 24,
            (Math.random() - 0.5) * 15,
            -3 - Math.random() * 7
        );
    }

    const starGeometry = new THREE.BufferGeometry();

    starGeometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(stars, 3)
    );

    scene.add(
        new THREE.Points(
            starGeometry,
            new THREE.PointsMaterial({
                color: 0xb3d7ff,
                size: 0.025
            })
        )
    );

    // Mouse controls
    let dragging = false;
    let previousX = 0;
    let previousY = 0;

    root.addEventListener('pointerdown', event => {
        dragging = true;
        previousX = event.clientX;
        previousY = event.clientY;

        root.setPointerCapture(event.pointerId);
    });

    root.addEventListener('pointerup', () => {
        dragging = false;
    });

    root.addEventListener('pointercancel', () => {
        dragging = false;
    });

    root.addEventListener('pointermove', event => {
        if (!dragging) return;

        globe.rotation.y +=
            (event.clientX - previousX) * 0.006;

        globe.rotation.x +=
            (event.clientY - previousY) * 0.006;

        previousX = event.clientX;
        previousY = event.clientY;
    });

    root.addEventListener('wheel', event => {
        if (large) {
            event.preventDefault();

            camera.position.z = Math.min(
                11,
                Math.max(
                    5,
                    camera.position.z + event.deltaY * 0.004
                )
            );
        }
    }, { passive: false });

    // Resize support
    function resize() {
        const width = root.clientWidth;
        const height = root.clientHeight;

        if (width < 2 || height < 2) return;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        renderer.setSize(width, height, false);
    }

    scenes.push(resize);
    resize();

    // Animation
    let tick = 0;

    function animate() {
        requestAnimationFrame(animate);

        tick += 0.004;

        if (!dragging) {
            globe.rotation.y += 0.0017;
        }

        for (const satellite of satellites) {
            satellite.dot.position.set(
                Math.cos(tick + satellite.angle) *
                    satellite.radius,

                Math.sin(tick + satellite.angle) *
                    satellite.radius,

                0
            );
        }

        renderer.render(scene, camera);
    }

    animate();

    new ResizeObserver(resize).observe(root);
}

function earthResize() {
    scenes.forEach(resize => resize());
}

// ==========================================
// START APPLICATION
// ==========================================

window.addEventListener('load', () => {
    buildEarth('earthHero', false);
    buildEarth('earthMonitor', true);
    initialize();
});
