document.addEventListener('DOMContentLoaded', () => {
    // --- GLOBAL VARIABLES & CONFIG ---
    const { PDFDocument } = PDFLib;
    const pdfjsLib = window['pdfjs-dist/build/pdf'];
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@2.16.105/build/pdf.worker.min.js`;

    let currentTool = null;
    let uploadedFiles = [];

    // --- DOM ELEMENT REFERENCES ---
    const getEl = (id) => document.getElementById(id);
    const header = getEl('header');
    const hamburgerMenu = getEl('hamburger-menu');
    const mobileNav = getEl('mobile-nav');
    const toolsGrid = getEl('tools-grid');
    const modal = getEl('tool-modal');
    const modalTitle = getEl('modal-title');
    const closeModalBtn = getEl('close-modal-btn');
    const dropArea = getEl('drop-area');
    const fileInput = getEl('file-input');
    const fileList = getEl('file-list');
    const toolOptions = getEl('tool-options');
    const processBtn = getEl('process-btn');
    const outputArea = getEl('output-area');
    const loader = getEl('loader');
    const loaderText = getEl('loader-text');

    // --- TOOL DEFINITIONS ---
    const toolImplementations = {
        'merge-pdf': {
            title: 'Merge PDF', desc: 'Combine multiple PDFs into one single document.', icon: '🔗', fileType: '.pdf', multiple: true,
            async process(files) {
                showLoader('Merging PDFs...');
                const mergedPdf = await PDFDocument.create();
                for (const file of files) {
                    const pdfBytes = await file.arrayBuffer();
                    const pdf = await PDFDocument.load(pdfBytes);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach(page => mergedPdf.addPage(page));
                }
                const mergedPdfBytes = await mergedPdf.save();
                createDownloadLink(mergedPdfBytes, 'merged.pdf', 'application/pdf');
            }
        },
        'compress-pdf': {
            title: 'Compress PDF', desc: 'Reduce the file size of your PDF.', icon: '📦', fileType: '.pdf', multiple: false,
            options(container) {
                 container.innerHTML = `<label for="quality-slider">Image Quality (lower is smaller): <strong>70%</strong></label><input type="range" id="quality-slider" min="0.1" max="1.0" step="0.05" value="0.7" oninput="this.previousElementSibling.querySelector('strong').textContent = Math.round(this.value * 100) + '%' ">`;
            },
            async process(files, options) {
                showLoader('Compressing PDF...');
                const quality = parseFloat(options['quality-slider']);
                const file = files[0];
                const pdfData = new Uint8Array(await file.arrayBuffer());
                const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
                const numPages = pdf.numPages;
                const newPdf = await PDFDocument.create();

                for (let i = 1; i <= numPages; i++) {
                    showLoader(`Processing page ${i} of ${numPages}...`);
                    const page = await pdf.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;

                    await page.render({ canvasContext: context, viewport: viewport }).promise;
                    
                    const imageDataUrl = canvas.toDataURL('image/jpeg', quality);
                    const imageBytes = await fetch(imageDataUrl).then(res => res.arrayBuffer());
                    const image = await newPdf.embedJpg(imageBytes);

                    const newPage = newPdf.addPage([viewport.width, viewport.height]);
                    newPage.drawImage(image, { x: 0, y: 0, width: viewport.width, height: viewport.height });
                }

                const compressedPdfBytes = await newPdf.save();
                createDownloadLink(compressedPdfBytes, 'compressed.pdf', 'application/pdf');
            }
        },
        'split-pdf': {
            title: 'Split PDF', desc: 'Extract a range of pages from a PDF file.', icon: '✂️', fileType: '.pdf', multiple: false,
            options(container) {
                container.innerHTML = `<label for="page-range">Page range to extract (e.g., 1-3, 5, 8-10):</label><input type="text" id="page-range" placeholder="e.g., 1-3, 5, 8-10">`;
            },
            async process(files, options) {
                showLoader('Splitting PDF...');
                const rangeStr = options['page-range'];
                if (!rangeStr) throw new Error('Page range is required.');

                const pdfBytes = await files[0].arrayBuffer();
                const pdf = await PDFDocument.load(pdfBytes);
                const newPdf = await PDFDocument.create();

                const pageIndices = new Set();
                 rangeStr.split(',').forEach(part => {
                    part = part.trim();
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(Number);
                        if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) pageIndices.add(i - 1);
                        }
                    } else {
                        const pageNum = Number(part);
                        if (!isNaN(pageNum)) pageIndices.add(pageNum - 1);
                    }
                });
                
                const validIndices = Array.from(pageIndices).filter(i => i >= 0 && i < pdf.getPageCount());
                if (validIndices.length === 0) throw new Error('No valid pages were selected.');

                const copiedPages = await newPdf.copyPages(pdf, validIndices);
                copiedPages.forEach(page => newPdf.addPage(page));

                const splitPdfBytes = await newPdf.save();
                createDownloadLink(splitPdfBytes, 'split.pdf', 'application/pdf');
            }
        },
        'delete-pages': { 
            title: 'Delete Pages', desc: 'Remove specific pages from a PDF.', icon: '🗑️', fileType: '.pdf', multiple: false,
            options(container) {
                container.innerHTML = `<label for="page-range">Pages to delete (e.g., 1-3, 5):</label><input type="text" id="page-range" placeholder="e.g., 1-3, 5, 9">`;
            },
            async process(files, options) {
                showLoader('Deleting pages...');
                const rangeStr = options['page-range'];
                if (!rangeStr) throw new Error('Page range is required.');
                const pdfBytes = await files[0].arrayBuffer();
                const pdfDoc = await PDFDocument.load(pdfBytes);
                
                const indicesToRemove = new Set();
                 rangeStr.split(',').forEach(part => {
                    part = part.trim();
                    if (part.includes('-')) {
                        const [start, end] = part.split('-').map(Number);
                         if (!isNaN(start) && !isNaN(end)) {
                            for (let i = start; i <= end; i++) indicesToRemove.add(i - 1);
                        }
                    } else {
                        const pageNum = Number(part);
                        if (!isNaN(pageNum)) indicesToRemove.add(pageNum - 1);
                    }
                });
                
                const sortedIndices = Array.from(indicesToRemove).sort((a, b) => b - a);
                 if (sortedIndices.length === 0) throw new Error('No valid pages were selected for deletion.');

                sortedIndices.forEach(index => {
                    if (index >= 0 && index < pdfDoc.getPageCount()) {
                        pdfDoc.removePage(index);
                    }
                });
                
                const newPdfBytes = await pdfDoc.save();
                createDownloadLink(newPdfBytes, 'deleted.pdf', 'application/pdf');
            }
        },
    };
    
    // --- UI INITIALIZATION & EVENT LISTENERS ---

    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 50);
    });

    hamburgerMenu.addEventListener('click', () => {
        hamburgerMenu.classList.toggle('active');
        mobileNav.classList.toggle('active');
    });

    mobileNav.addEventListener('click', () => {
        hamburgerMenu.classList.remove('active');
        mobileNav.classList.remove('active');
    });
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1 });

    function generateToolCards() {
        Object.keys(toolImplementations).forEach(key => {
            const tool = toolImplementations[key];
            const card = document.createElement('div');
            card.className = 'tool-card';
            card.dataset.tool = key;
            card.innerHTML = `
                <div class="tool-icon">${tool.icon}</div>
                <h3>${tool.title}</h3>
                <p>${tool.desc}</p>
            `;
            card.addEventListener('click', () => openModal(key));
            toolsGrid.appendChild(card);
            revealObserver.observe(card);
        });
    }

    function openModal(toolId) {
        currentTool = toolId;
        resetModal();
        const tool = toolImplementations[toolId];
        modalTitle.textContent = tool.title;
        fileInput.accept = tool.fileType;
        fileInput.multiple = tool.multiple || false;
        if (tool.options) tool.options(toolOptions);
        modal.style.display = 'flex';
    }

    function closeModal() {
        modal.style.display = 'none';
        resetModal();
    }

    function resetModal() {
        uploadedFiles = [];
        updateFileList();
        toolOptions.innerHTML = '';
        outputArea.innerHTML = '';
        fileInput.value = '';
    }

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });
    closeModalBtn.addEventListener('click', closeModal);

    dropArea.addEventListener('click', () => fileInput.click());
    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropArea.classList.add('dragover');
    });
    dropArea.addEventListener('dragleave', () => dropArea.classList.remove('dragover'));
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        dropArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        const tool = toolImplementations[currentTool];
        const newFiles = Array.from(files);
        const allowedTypes = tool.fileType.split(',').map(t => t.trim().toLowerCase());
        const validFiles = newFiles.filter(file => {
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            return allowedTypes.includes(extension);
        });

        if (validFiles.length !== newFiles.length) {
            showError(`Invalid file type. Please upload ${tool.fileType} files.`);
        }

        if (tool.multiple) {
            uploadedFiles.push(...validFiles);
        } else if (validFiles.length > 0) {
            uploadedFiles = [validFiles[0]];
        }
        updateFileList();
    }

    function updateFileList() {
        fileList.innerHTML = '';
        uploadedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'file-item';
            fileItem.innerHTML = `
                <span>${file.name}</span>
                <button class="remove-file-btn" data-index="${index}">&times;</button>
            `;
            fileList.appendChild(fileItem);
        });
        processBtn.disabled = uploadedFiles.length === 0;
    }

    fileList.addEventListener('click', (e) => {
        if (e.target.classList.contains('remove-file-btn')) {
            const index = parseInt(e.target.dataset.index, 10);
            uploadedFiles.splice(index, 1);
            updateFileList();
        }
    });
    
    processBtn.addEventListener('click', async () => {
        const tool = toolImplementations[currentTool];
        if (!tool.process || uploadedFiles.length === 0) return;

        try {
            const options = {};
            const inputs = toolOptions.querySelectorAll('input, select');
            inputs.forEach(input => options[input.id] = input.value);
            
            outputArea.innerHTML = '';
            await tool.process(uploadedFiles, options);
        } catch (error) {
            console.error(error);
            showError(`An error occurred: ${error.message}`);
        } finally {
            hideLoader();
        }
    });

    // --- UTILITY FUNCTIONS ---
    function showLoader(text = 'Processing...') {
        loaderText.textContent = text;
        loader.style.display = 'flex';
    }

    function hideLoader() {
        loader.style.display = 'none';
    }

    function showError(message) {
        alert(message);
    }

    function createDownloadLink(data, filename, mimeType) {
        outputArea.innerHTML = '';
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.textContent = `Download ${filename}`;
        a.className = 'download-link';
        outputArea.appendChild(a);
    }
    
    document.querySelectorAll('.reveal').forEach(el => {
        revealObserver.observe(el);
    });

    // --- INITIALIZE APP ---
    generateToolCards();
});