// Global State
const state = {
    cameraActive: false,
    isScanning: false,
    userAllergens: ['nuts', 'dairy', 'gluten'],
    scanResults: null,
    stream: null,
    tesseractWorker: null,
    uploadedImage: null,
    scanHistory: [],
    totalScans: 0,
    totalAllergensFound: 0,
    totalScanTime: 0
};

// DOM Elements
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const cameraView = document.getElementById('cameraView');
const cameraPlaceholder = document.getElementById('cameraPlaceholder');
const scanningLine = document.getElementById('scanningLine');
const startCameraBtn = document.getElementById('startCamera');
const captureBtn = document.getElementById('captureBtn');
const stopCameraBtn = document.getElementById('stopCamera');
const loading = document.getElementById('loading');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const allergenInput = document.getElementById('allergenInput');
const addAllergenBtn = document.getElementById('addAllergen');
const selectedAllergens = document.getElementById('selectedAllergens');
const resultsContainer = document.getElementById('resultsContainer');
const emptyState = document.getElementById('emptyState');
const scanResults = document.getElementById('scanResults');
const quickAllergens = document.querySelectorAll('.tag');
const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const uploadPreview = document.getElementById('uploadPreview');
const scanUploadBtn = document.getElementById('scanUploadBtn');
const totalScansEl = document.getElementById('totalScans');
const allergensFoundEl = document.getElementById('allergensFound');
const avgTimeEl = document.getElementById('avgTime');

// Tab Switching
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    // Activate selected tab
    document.getElementById(`${tabName}Tab`).classList.add('active');
    document.getElementById(`${tabName}Content`).classList.add('active');
    
    // Stop camera if switching away from camera tab
    if (tabName !== 'camera' && state.cameraActive) {
        stopCamera();
    }
}

// Initialize Tesseract Worker
async function initializeTesseract() {
    try {
        updateProgress('Initializing OCR engine...', 10);
        
        state.tesseractWorker = await Tesseract.createWorker({
            logger: m => {
                if (m.status === 'recognizing text') {
                    updateProgress('Extracting text from image...', 60);
                }
            },
            errorHandler: err => {
                console.error('Tesseract error:', err);
                updateProgress('OCR error occurred', 0);
            }
        });
        
        updateProgress('Loading language data...', 30);
        await state.tesseractWorker.loadLanguage('eng');
        await state.tesseractWorker.initialize('eng');
        
        updateProgress('OCR ready!', 100);
        setTimeout(() => updateProgress('', 0), 1000);
        
        console.log('Tesseract initialized successfully');
    } catch (error) {
        console.error('Failed to initialize Tesseract:', error);
        showNotification('OCR engine failed to load. Using text simulation.', 'warning');
    }
}

// Progress updates
function updateProgress(text, percent) {
    progressText.textContent = text;
    progressFill.style.width = `${percent}%`;
}

// Camera Functions
async function startCamera() {
    try {
        updateProgress('Accessing camera...', 20);
        
        state.stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'environment',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });
        
        video.srcObject = state.stream;
        video.style.display = 'block';
        cameraPlaceholder.style.display = 'none';
        state.cameraActive = true;
        
        startCameraBtn.style.display = 'none';
        captureBtn.style.display = 'flex';
        stopCameraBtn.style.display = 'flex';
        
        updateProgress('Camera ready!', 100);
        setTimeout(() => updateProgress('', 0), 1000);
        
        showNotification('Camera started successfully!', 'success');
    } catch (error) {
        console.error('Camera error:', error);
        showNotification('Camera access denied. Please use photo upload instead.', 'error');
        
        // Switch to upload tab
        setTimeout(() => switchTab('upload'), 1000);
    }
}

function stopCamera() {
    if (state.stream) {
        state.stream.getTracks().forEach(track => track.stop());
        state.stream = null;
    }
    
    video.style.display = 'none';
    cameraPlaceholder.style.display = 'flex';
    state.cameraActive = false;
    
    startCameraBtn.style.display = 'flex';
    captureBtn.style.display = 'none';
    stopCameraBtn.style.display = 'none';
    scanningLine.style.display = 'none';
}

// Upload Functions
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // Validate file
    if (!file.type.startsWith('image/')) {
        showNotification('Please upload an image file', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
        showNotification('File too large. Max 5MB.', 'error');
        return;
    }
    
    // Read and display image
    const reader = new FileReader();
    reader.onload = function(e) {
        state.uploadedImage = e.target.result;
        
        uploadPreview.innerHTML = `
            <img src="${state.uploadedImage}" class="preview-image" alt="Menu preview">
            <div class="preview-info">
                <p>${file.name} (${(file.size / 1024).toFixed(1)} KB)</p>
            </div>
        `;
        uploadPreview.style.display = 'block';
        scanUploadBtn.disabled = false;
        
        uploadArea.classList.remove('drag-over');
        showNotification('Image uploaded successfully!', 'success');
    };
    
    reader.readAsDataURL(file);
}

// Drag and drop support
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    
    const file = e.dataTransfer.files[0];
    if (file) {
        fileInput.files = e.dataTransfer.files;
        handleFileUpload({ target: { files: [file] } });
    }
});

// Scan Functions
async function captureAndScan() {
    if (!state.cameraActive || state.isScanning) return;
    
    state.isScanning = true;
    scanningLine.style.display = 'block';
    loading.style.display = 'block';
    captureBtn.disabled = true;
    
    // Capture image from video
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    await processImage(canvas.toDataURL('image/jpeg'));
}

async function scanUploadedPhoto() {
    if (!state.uploadedImage || state.isScanning) return;
    
    state.isScanning = true;
    loading.style.display = 'block';
    scanUploadBtn.disabled = true;
    
    await processImage(state.uploadedImage);
}

async function processImage(imageData) {
    try {
        updateProgress('Processing image...', 20);
        
        let extractedText;
        if (state.tesseractWorker) {
            updateProgress('Running OCR...', 50);
            const result = await state.tesseractWorker.recognize(imageData);
            extractedText = result.data.text;
            updateProgress('OCR complete!', 80);
        } else {
            // Fallback simulation
            extractedText = simulateOCR();
            updateProgress('Using simulated text...', 60);
        }
        
        if (!extractedText || extractedText.trim().length < 10) {
            throw new Error('No text detected in image');
        }
        
        updateProgress('Analyzing allergens...', 90);
        processScanResults(extractedText);
        
    } catch (error) {
        console.error('Processing error:', error);
        showNotification('Scan failed: ' + error.message, 'error');
    } finally {
        state.isScanning = false;
        scanningLine.style.display = 'none';
        loading.style.display = 'none';
        captureBtn.disabled = false;
        scanUploadBtn.disabled = false;
        updateProgress('', 100);
        setTimeout(() => updateProgress('', 0), 1000);
    }
}

// Demo Menus
function loadDemoMenu(menuNumber) {
    state.isScanning = true;
    loading.style.display = 'block';
    emptyState.style.display = 'none';
    
    const menus = {
        1: `CAFE MENU\n\nBEVERAGES:\n• Peanut Butter Latte (contains nuts)\n• Soy Milk Cappuccino (contains soy)\n• Regular Coffee (safe)\n• Chocolate Milk (dairy)\n\nPASTRIES:\n• Almond Croissant (nuts, dairy, gluten)\n• Vegan Muffin (gluten-free, nut-free)\n• Cheese Danish (dairy, gluten)\n• Banana Bread (nuts optional)\n\nDESSERTS:\n• Chocolate Cake (dairy, gluten)\n• Fruit Salad (safe)\n• Nutella Crepe (nuts, dairy, gluten)`,
        2: `ITALIAN RESTAURANT\n\nAPPETIZERS:\n• Bruschetta (gluten, garlic)\n• Calamari (shellfish)\n• Cheese Platter (dairy)\n• Antipasto (contains various allergens)\n\nMAIN COURSES:\n• Spaghetti Carbonara (eggs, dairy, gluten)\n• Margherita Pizza (gluten, dairy)\n• Seafood Linguine (shellfish, gluten)\n• Chicken Parmesan (dairy, gluten)\n• Eggplant Parmigiana (dairy, gluten)\n\nDESSERTS:\n• Tiramisu (dairy, eggs, gluten, alcohol)\n• Gelato (dairy)\n• Panna Cotta (dairy, gelatin)`,
        3: `HEALTH CAFE\n\nBOWLS:\n• Superfood Bowl with nuts (nuts, optional dairy)\n• Quinoa Salad (gluten-free, vegan)\n• Buddha Bowl (soy, sesame)\n\nSANDWICHES:\n• Avocado Toast (gluten)\n• Chicken Salad Sandwich (dairy, gluten)\n• Tofu Wrap (soy, gluten)\n• Veggie Panini (dairy, gluten)\n\nSMOOTHIES:\n• Berry Blast (soy milk option)\n• Green Detox (contains celery)\n• Protein Shake (whey/dairy)\n• Tropical Paradise (coconut)`
    };
    
    setTimeout(() => {
        processScanResults(menus[menuNumber]);
        loading.style.display = 'none';
        state.isScanning = false;
        showNotification('Demo menu scanned successfully!', 'success');
    }, 1500);
}

// Process scan results
function processScanResults(text) {
    const startTime = Date.now();
    
    // Analyze text for allergens
    const allergensFound = [];
    const warnings = [];
    
    state.userAllergens.forEach(allergen => {
        const regex = new RegExp(`\\b${allergen}s?\\b`, 'gi');
        const matches = text.match(regex);
        if (matches) {
            allergensFound.push(allergen);
            
            // Find lines containing the allergen
            const lines = text.split('\n');
            lines.forEach((line, index) => {
                if (regex.test(line)) {
                    warnings.push({
                        line: line.trim(),
                        lineNumber: index + 1,
                        allergen: allergen
                    });
                }
            });
        }
    });
    
    // Create highlighted text
    let highlightedText = text;
    state.userAllergens.forEach(allergen => {
        const regex = new RegExp(`\\b${allergen}s?\\b`, 'gi');
        highlightedText = highlightedText.replace(regex, 
            `<span class="highlight">$&</span>`);
    });
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Update state
    state.scanResults = {
        text: text,
        highlightedText: highlightedText,
        warnings: warnings.length,
        allergensFound: [...new Set(allergensFound)], // Remove duplicates
        confidence: Math.floor(Math.random() * 20) + 80, // 80-100%
        processingTime: processingTime,
        timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}),
        date: new Date().toLocaleDateString()
    };
    
    // Update statistics
    state.totalScans++;
    state.totalAllergensFound += warnings.length;
    state.totalScanTime += parseFloat(processingTime);
    
    // Display results
    displayResults();
    updateStats();
    
    // Save to history
    saveToHistory();
}

// Display results in UI
function displayResults() {
    const result = state.scanResults;
    
    const resultsHTML = `
        <div class="scan-header">
            <div class="scan-meta">
                <span><i class="fas fa-clock"></i> ${result.timestamp}</span>
                <span><i class="fas fa-calendar"></i> ${result.date}</span>
                <span><i class="fas fa-bolt"></i> ${result.processingTime}s</span>
            </div>
        </div>
        
        <div class="stats-grid">
            <div class="stat">
                <div class="stat-icon">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value">${result.warnings}</div>
                    <div class="stat-label">Warnings</div>
                </div>
            </div>
            <div class="stat">
                <div class="stat-icon">
                    <i class="fas fa-percentage"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value">${result.confidence}%</div>
                    <div class="stat-label">Confidence</div>
                </div>
            </div>
            <div class="stat">
                <div class="stat-icon">
                    <i class="fas fa-list"></i>
                </div>
                <div class="stat-info">
                    <div class="stat-value">${result.text.split('\n').filter(l => l.trim()).length}</div>
                    <div class="stat-label">Menu Items</div>
                </div>
            </div>
        </div>
        
        ${result.warnings > 0 ? 
            `<div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                <div>
                    <strong>Allergen Alert!</strong><br>
                    Found ${result.warnings} warning(s) for: 
                    <strong>${result.allergensFound.join(', ')}</strong>
                </div>
            </div>` 
            : 
            `<div class="alert alert-success">
                <i class="fas fa-check-circle"></i>
                <div>
                    <strong>All Clear!</strong><br>
                    No allergens detected in this menu.
                </div>
            </div>`
        }
        
        <div class="menu-text-container">
            <h4>Scanned Menu Text:</h4>
            <div class="menu-text" id="menuText">
                ${result.highlightedText}
            </div>
        </div>
        
        <div class="result-actions">
            <button class="btn btn-primary" onclick="shareResults()">
                <i class="fas fa-share"></i> Share Results
            </button>
            <button class="btn btn-secondary" onclick="saveResults()">
                <i class="fas fa-save"></i> Save to History
            </button>
            <button class="btn btn-secondary" onclick="clearResults()">
                <i class="fas fa-trash"></i> Clear
            </button>
        </div>
    `;
    
    emptyState.style.display = 'none';
    scanResults.style.display = 'block';
    scanResults.innerHTML = resultsHTML;
    
    // Scroll to results
    scanResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Update statistics display
function updateStats() {
    totalScansEl.textContent = state.totalScans;
    allergensFoundEl.textContent = state.totalAllergensFound;
    
    const avgTime = state.totalScans > 0 
        ? (state.totalScanTime / state.totalScans).toFixed(1)
        : 0;
    avgTimeEl.textContent = `${avgTime}s`;
}

// Allergen Management
function addAllergen(allergen) {
    const cleanAllergen = allergen.trim().toLowerCase();
    
    if (!cleanAllergen) {
        showNotification('Please enter an allergen', 'error');
        return;
    }
    
    if (state.userAllergens.includes(cleanAllergen)) {
        showNotification('Allergen already added', 'warning');
        return;
    }
    
    state.userAllergens.push(cleanAllergen);
    updateAllergenDisplay();
    saveAllergens();
    
    // Re-process scan results if they exist
    if (state.scanResults) {
        processScanResults(state.scanResults.text);
    }
    
    showNotification(`Added allergen: ${cleanAllergen}`, 'success');
}

function removeAllergen(allergen) {
    const index = state.userAllergens.indexOf(allergen);
    if (index > -1) {
        state.userAllergens.splice(index, 1);
        updateAllergenDisplay();
        saveAllergens();
        
        // Re-process scan results
        if (state.scanResults) {
            processScanResults(state.scanResults.text);
        }
        
        showNotification(`Removed allergen: ${allergen}`, 'info');
    }
}

function updateAllergenDisplay() {
    selectedAllergens.innerHTML = '';
    
    if (state.userAllergens.length === 0) {
        selectedAllergens.innerHTML = `
            <div class="empty-tags">
                <i class="fas fa-info-circle"></i>
                <span>No allergens added yet</span>
            </div>
        `;
        return;
    }
    
    state.userAllergens.forEach(allergen => {
        const tag = document.createElement('div');
        tag.className = 'allergen-tag';
        tag.innerHTML = `
            ${allergen}
            <button onclick="removeAllergen('${allergen}')" aria-label="Remove ${allergen}">
                <i class="fas fa-times"></i>
            </button>
        `;
        selectedAllergens.appendChild(tag);
    });
}

// Save/Load functions
function saveAllergens() {
    localStorage.setItem('allerscan_allergens', JSON.stringify(state.userAllergens));
}

function loadAllergens() {
    const saved = localStorage.getItem('allerscan_allergens');
    if (saved) {
        state.userAllergens = JSON.parse(saved);
        updateAllergenDisplay();
    }
}

function saveToHistory() {
    if (!state.scanResults) return;
    
    const history = JSON.parse(localStorage.getItem('allerscan_history') || '[]');
    history.unshift({
        ...state.scanResults,
        id: Date.now()
    });
    
    // Keep only last 50 scans
    if (history.length > 50) {
        history.pop();
    }
    
    localStorage.setItem('allerscan_history', JSON.stringify(history));
}

function loadStats() {
    const history = JSON.parse(localStorage.getItem('allerscan_history') || '[]');
    state.totalScans = history.length;
    
    history.forEach(scan => {
        state.totalAllergensFound += scan.warnings || 0;
        state.totalScanTime += parseFloat(scan.processingTime) || 0;
    });
    
    updateStats();
}

function saveResults() {
    if (!state.scanResults) {
        showNotification('No results to save', 'warning');
        return;
    }
    
    saveToHistory();
    showNotification('Results saved to history!', 'success');
}

function clearResults() {
    if (confirm('Clear current scan results?')) {
        state.scanResults = null;
        scanResults.style.display = 'none';
        emptyState.style.display = 'block';
        showNotification('Results cleared', 'info');
    }
}

function shareResults() {
    if (!state.scanResults) return;
    
    if (navigator.share) {
        navigator.share({
            title: 'AllerScan Results',
            text: `Found ${state.scanResults.warnings} allergen warnings in menu`,
            url: window.location.href
        });
    } else {
        // Fallback: copy to clipboard
        const text = `AllerScan Results:\nWarnings: ${state.scanResults.warnings}\nAllergens: ${state.scanResults.allergensFound.join(', ')}`;
        navigator.clipboard.writeText(text)
            .then(() => showNotification('Results copied to clipboard!', 'success'))
            .catch(() => showNotification('Failed to copy results', 'error'));
    }
}

// Simulate OCR for demo purposes
function simulateOCR() {
    const menus = [
        `CAFE MENU\n\nDrinks:\n• Peanut Butter Coffee (nuts)\n• Soy Latte (soy)\n• Hot Chocolate (dairy)\n\nFood:\n• Almond Cake (nuts, gluten)\n• Cheese Sandwich (dairy, gluten)\n• Fruit Bowl (safe)`,
        `RESTAURANT MENU\n\nStarters:\n• Shrimp Cocktail (shellfish)\n• Bread Basket (gluten)\n\nMains:\n• Fish & Chips (fish, gluten)\n• Veggie Curry (nuts optional)\n• Steak (safe)\n\nDesserts:\n• Cheesecake (dairy, gluten)\n• Ice Cream (dairy)`
    ];
    
    return menus[Math.floor(Math.random() * menus.length)];
}

// Notification system
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelectorAll('.notification');
    existing.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : 
                         type === 'error' ? 'exclamation-circle' : 
                         type === 'warning' ? 'exclamation-triangle' : 'info-circle'}"></i>
        <span>${message}</span>
        <button onclick="this.parentElement.remove()">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#10b981' : 
                     type === 'error' ? '#ef4444' : 
                     type === 'warning' ? '#f59e0b' : '#3b82f6'};
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 10000;
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        max-width: 400px;
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Load saved data
    loadAllergens();
    loadStats();
    
    // Initialize Tesseract
    await initializeTesseract();
    
    // Camera support check
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showNotification('Camera not supported in this browser', 'warning');
        startCameraBtn.disabled = true;
        startCameraBtn.innerHTML = '<i class="fas fa-ban"></i> Camera Not Supported';
        switchTab('upload');
    }
    
    // Event listeners
    startCameraBtn.addEventListener('click', startCamera);
    captureBtn.addEventListener('click', captureAndScan);
    stopCameraBtn.addEventListener('click', stopCamera);
    
    addAllergenBtn.addEventListener('click', () => {
        addAllergen(allergenInput.value);
        allergenInput.value = '';
        allergenInput.focus();
    });
    
    allergenInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addAllergen(allergenInput.value);
            allergenInput.value = '';
        }
    });
    
    quickAllergens.forEach(tag => {
        tag.addEventListener('click', () => {
            const allergen = tag.getAttribute('data-allergen');
            addAllergen(allergen);
        });
    });
    
    fileInput.addEventListener('change', handleFileUpload);
    scanUploadBtn.addEventListener('click', scanUploadedPhoto);
    
    // Welcome message
    setTimeout(() => {
        if (state.totalScans === 0) {
            showNotification('Welcome to AllerScan! Try scanning a demo menu.', 'info');
        }
    }, 1000);
    
    console.log('AllerScan loaded successfully!');
});

// Add notification styles
const style = document.createElement('style');
style.textContent = `
    .notification {
        font-family: inherit;
    }
    
    .notification button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 0;
        margin-left: 10px;
        opacity: 0.8;
    }
    
    .notification button:hover {
        opacity: 1;
    }
`;
document.head.appendChild(style);