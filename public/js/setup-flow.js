/**
 * Setup Flow JavaScript - Single-Page Subway Map Setup
 * Handles all 6 steps of the onboarding flow with persistent progress indication
 */

// ============================================================================
// Constants & Configuration
// ============================================================================

const STEPS = [
  {
    number: 1,
    title: 'Sign In with Notion',
    icon: '🔗',
    duration: '30s',
    description: 'Authorize Sage Stocks',
  },
  {
    number: 2,
    title: 'Duplicate Template',
    icon: '📄',
    duration: '1 min',
    description: 'Copy to your workspace',
  },
  {
    number: 3,
    title: 'Setup Verification',
    icon: '✓',
    duration: '30s',
    description: 'Auto-detecting databases',
  },
  {
    number: 4,
    title: 'Run First Analysis',
    icon: '📊',
    duration: '15s',
    description: 'Enter ticker & analyze',
  },
  {
    number: 5,
    title: 'View Results',
    icon: '👁️',
    duration: '2:15',
    description: 'Open in Notion',
  },
  {
    number: 6,
    title: 'Complete!',
    icon: '🎉',
    duration: '',
    description: 'You\'re all set',
  },
];

const TEMPLATE_URL = 'https://ormsby.notion.site/Sage-Stocks-28ca1d1b67e080ea8424c9e64f4648a9?source=copy_link';

// ============================================================================
// Global State
// ============================================================================

let currentState = {
  setupComplete: false,
  currentStep: 1,
  completedSteps: [],
  setupProgress: null,
  user: null,
  pollingInterval: null,
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Setup flow initialized');

  // Check for URL params (OAuth callback, errors, etc.)
  const params = new URLSearchParams(window.location.search);
  const stepParam = params.get('step');
  const errorParam = params.get('error');
  const statusParam = params.get('status');

  // Handle errors
  if (errorParam) {
    showError(getErrorMessage(errorParam));
  }

  // Load setup status from API first (to check if they've been approved since last visit)
  await loadSetupStatus();

  // If they have a session but status param says pending/denied, check actual status from API
  if (statusParam === 'pending' || statusParam === 'denied') {
    // User object from API will have current approval status
    if (currentState.user && currentState.user.status === 'approved') {
      // They were approved! Clear the URL param and continue with setup
      window.history.replaceState({}, '', '/');
      // Continue with normal flow below
    } else {
      // Still pending/denied - show status message but ALSO show subway map
      renderSubwayMap();
      showStatusMessage(statusParam);
      return;
    }
  }

  // If OAuth callback just completed (step=2 means OAuth succeeded, now on duplicate)
  if (stepParam === '2') {
    currentState.currentStep = 2;
    currentState.completedSteps = [1]; // OAuth (step 1) is now complete
    await advanceToStep(2, { step1Complete: true });
  }

  // Render subway map and content
  renderSubwayMap();
  renderStepContent();

  // Auto-trigger Step 3 (verification) if we just completed Step 2 (duplicate)
  if (currentState.currentStep === 3) {
    setTimeout(() => {
      triggerAutoDetection();
    }, 500);
  }
});

// ============================================================================
// API Communication
// ============================================================================

async function loadSetupStatus() {
  try {
    const response = await fetch('/api/setup/status');
    const data = await response.json();

    if (!response.ok) {
      if (data.requiresAuth) {
        // No session - show Step 1 & 2 (pre-OAuth)
        currentState.currentStep = 1;
        currentState.completedSteps = [];
        return;
      }
      throw new Error(data.error || 'Failed to load setup status');
    }

    currentState.setupComplete = data.setupComplete;
    currentState.setupProgress = data.setupProgress;
    currentState.user = data.user;
    currentState.currentStep = data.setupProgress?.currentStep || 1;
    currentState.completedSteps = data.setupProgress?.completedSteps || [];

    // If setup is complete, redirect to analyzer
    if (data.setupComplete && currentState.currentStep === 6) {
      console.log('✓ Setup complete, redirecting to analyzer...');
      setTimeout(() => {
        window.location.href = '/analyze.html';
      }, 1000);
    }
  } catch (error) {
    console.error('❌ Failed to load setup status:', error);
    // Assume fresh user if API fails
    currentState.currentStep = 1;
    currentState.completedSteps = [];
  }
}

async function advanceToStep(step, data = null) {
  try {
    const response = await fetch('/api/setup/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ step, data }),
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || 'Failed to advance step');
    }

    currentState.setupProgress = result.setupProgress;
    currentState.currentStep = result.setupProgress.currentStep;
    currentState.completedSteps = result.setupProgress.completedSteps;

    renderSubwayMap();
    renderStepContent();

    console.log(`✓ Advanced to step ${step}`);
  } catch (error) {
    console.error(`❌ Failed to advance to step ${step}:`, error);
    showError(`Failed to update progress: ${error.message}`);
  }
}

// ============================================================================
// Subway Map Rendering
// ============================================================================

function renderSubwayMap() {
  const desktopContainer = document.querySelector('#subway-map .hidden.md\\:flex');
  const mobileContainer = document.querySelector('#subway-map .md\\:hidden');

  if (!desktopContainer || !mobileContainer) return;

  // Clear existing content
  desktopContainer.innerHTML = '';
  mobileContainer.innerHTML = '';

  // Render each step
  STEPS.forEach((step, index) => {
    const state = getStepState(step.number);
    const isLast = index === STEPS.length - 1;

    // Desktop (horizontal)
    desktopContainer.appendChild(createStepIndicator(step, state, false, isLast));

    // Mobile (vertical)
    mobileContainer.appendChild(createStepIndicator(step, state, true, isLast));
  });

  // Update progress badge
  updateProgressBadge();
}

function createStepIndicator(step, state, isVertical, isLast) {
  const container = document.createElement('div');
  container.className = isVertical ? 'relative' : 'flex-1 text-center relative';

  const indicator = document.createElement('div');
  indicator.className = `step-indicator ${state} ${state === 'in-progress' ? 'pulse-slow' : ''}`;

  if (state === 'complete') {
    indicator.innerHTML = '✓';
  } else if (state === 'in-progress') {
    indicator.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border: 3px solid #3B82F6; border-top-color: transparent; border-radius: 50%;"></div>`;
  } else {
    indicator.textContent = step.number;
  }

  const title = document.createElement('div');
  title.className = 'mt-2 font-semibold text-sm text-gray-900';
  title.textContent = step.title;

  const description = document.createElement('div');
  description.className = 'text-xs text-gray-600 mt-1';
  description.textContent = `${step.icon} ${step.description}`;

  const duration = document.createElement('div');
  duration.className = 'text-xs text-gray-500 mt-1';
  duration.textContent = step.duration ? `⏱️ ${step.duration}` : '';

  if (isVertical) {
    const content = document.createElement('div');
    content.className = 'flex items-start gap-4';

    const indicatorWrapper = document.createElement('div');
    indicatorWrapper.className = 'relative flex-shrink-0';
    indicatorWrapper.appendChild(indicator);

    // Add connector line for vertical layout (except last step)
    if (!isLast) {
      const connector = document.createElement('div');
      connector.className = `subway-connector ${state === 'complete' ? 'complete' : ''}`;
      indicatorWrapper.appendChild(connector);
    }

    const textContent = document.createElement('div');
    textContent.className = 'flex-1 pt-2';
    textContent.appendChild(title);
    textContent.appendChild(description);
    if (step.duration) textContent.appendChild(duration);

    content.appendChild(indicatorWrapper);
    content.appendChild(textContent);
    container.appendChild(content);
  } else {
    container.appendChild(indicator);
    container.appendChild(title);
    container.appendChild(description);
    if (step.duration) container.appendChild(duration);
  }

  return container;
}

function getStepState(stepNumber) {
  if (currentState.completedSteps.includes(stepNumber)) {
    return 'complete';
  }
  if (currentState.currentStep === stepNumber) {
    return 'in-progress';
  }
  return 'pending';
}

function updateProgressBadge() {
  const badge = document.getElementById('progress-badge');
  const badgeStep = document.getElementById('badge-step');

  if (!badge || !badgeStep) return;

  if (currentState.currentStep <= 5) {
    badge.classList.remove('hidden');
    badgeStep.textContent = currentState.currentStep;
  } else {
    badge.classList.add('hidden');
  }
}

// ============================================================================
// Step Content Rendering
// ============================================================================

function renderStepContent() {
  const container = document.getElementById('setup-content');
  if (!container) return;

  container.innerHTML = '';

  // Render content based on current step
  switch (currentState.currentStep) {
    case 1:
      container.appendChild(createStep1Content());
      break;
    case 2:
      container.appendChild(createStep2Content());
      break;
    case 3:
      container.appendChild(createStep3Content());
      break;
    case 4:
      container.appendChild(createStep4Content());
      break;
    case 5:
      container.appendChild(createStep5Content());
      break;
    case 6:
      container.appendChild(createStep6Content());
      break;
  }
}

// ============================================================================
// Step 1: Sign In with Notion (OAuth)
// ============================================================================

function createStep1Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';
  section.innerHTML = `
    <div class="mb-6 p-6 rounded-lg border bg-blue-50 border-blue-200">
      <div class="flex items-start">
        <div class="text-3xl mr-4">🔗</div>
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Step 1: Sign In with Notion</h3>
          <p class="text-gray-700 mb-4">
            Let's start by connecting your Notion workspace. This allows Sage Stocks to read and write to your databases.
          </p>
          <p class="text-sm text-gray-600 mb-4">
            <strong>Note:</strong> After signing in, you'll be prompted to duplicate our template.
          </p>
          <button
            onclick="window.location.href='/api/auth/authorize'"
            class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
          >
            <img src="/notion-logo.png" alt="Notion" class="w-5 h-5 mr-2" onerror="this.style.display='none'" />
            Sign in with Notion
          </button>
        </div>
      </div>
    </div>
  `;

  return section;
}

// ============================================================================
// Step 2: Duplicate Template
// ============================================================================

function createStep2Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';
  section.innerHTML = `
    <div class="mb-6 p-6 rounded-lg border bg-green-50 border-green-200">
      <div class="flex items-start">
        <div class="text-3xl mr-4">📄</div>
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Step 2: Duplicate the Notion Template</h3>
          <p class="text-gray-700 mb-4">
            Get your own copy of the Sage Stocks template. This includes the Stock Analyses database, Stock History database, and the Sage Stocks page.
          </p>
          <a
            href="${TEMPLATE_URL}"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl mb-4"
          >
            📄 Duplicate Template <span class="ml-2">→</span>
          </a>
          <p class="text-sm text-gray-600 mb-4">
            <strong>Important:</strong> When duplicating, make sure the template goes to your workspace (not a private page).
          </p>
          <p class="text-sm text-gray-600 mb-4">After duplicating, return to this page and click below:</p>
          <div class="flex items-center gap-3">
            <input type="checkbox" id="step2-confirm" class="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500" />
            <label for="step2-confirm" class="text-gray-700 font-medium cursor-pointer">I've duplicated the template</label>
          </div>
          <button
            id="step2-continue"
            disabled
            class="mt-4 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Verification
          </button>
        </div>
      </div>
    </div>
  `;

  // Setup event listeners after render
  setTimeout(() => {
    const checkbox = section.querySelector('#step2-confirm');
    const button = section.querySelector('#step2-continue');

    if (checkbox && button) {
      checkbox.addEventListener('change', () => {
        button.disabled = !checkbox.checked;
      });

      button.addEventListener('click', async () => {
        button.disabled = true;
        button.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%;"></span> Starting verification...';
        await advanceToStep(3, { manualConfirm: true });
        // After advancing to step 3, trigger auto-detection
        setTimeout(() => {
          triggerAutoDetection();
        }, 500);
      });
    }
  }, 0);

  return section;
}

// ============================================================================
// Step 3: Setup Verification (Auto-Detection)
// ============================================================================

function createStep3Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';
  section.innerHTML = `
    <div id="step3-container" class="mb-6 p-6 rounded-lg border bg-yellow-50 border-yellow-200">
      <div class="flex items-start">
        <div class="text-3xl mr-4">🔍</div>
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Step 3: Verifying Your Setup</h3>
          <div id="step3-loading" class="text-center py-8">
            <div class="inline-block spinner mx-auto" style="width: 48px; height: 48px; border: 4px solid #F59E0B; border-top-color: transparent; border-radius: 50%;"></div>
            <p class="text-gray-700 font-medium mt-4">Searching your workspace for databases...</p>
            <p class="text-sm text-gray-600 mt-2">This takes about 30 seconds. Don't worry, we're only reading — no changes yet.</p>
          </div>
          <div id="step3-results" class="hidden">
            <!-- Results will be populated here -->
          </div>
          <div id="step3-manual" class="hidden">
            <!-- Manual input fallback will be shown here -->
          </div>
        </div>
      </div>
    </div>
  `;

  return section;
}

async function triggerAutoDetection() {
  console.log('🔍 Starting auto-detection...');

  try {
    const response = await fetch('/api/setup/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Auto-detection failed');
    }

    console.log('✓ Auto-detection complete:', data);

    if (data.alreadySetup) {
      // Already setup, advance to step 4
      await advanceToStep(4);
      return;
    }

    if (data.detection.needsManual) {
      // Partial detection - show manual fallback
      showManualFallback(data.detection);
    } else {
      // Success - show results for confirmation
      showDetectionResults(data.detection);
    }
  } catch (error) {
    console.error('❌ Auto-detection failed:', error);
    showError(`Auto-detection failed: ${error.message}. Please enter your database IDs manually.`);
    showManualFallback(null);
  }
}

function showDetectionResults(detection) {
  const loading = document.getElementById('step3-loading');
  const results = document.getElementById('step3-results');

  if (!loading || !results) return;

  loading.classList.add('hidden');
  results.classList.remove('hidden');

  results.innerHTML = `
    <div class="space-y-3 mb-6">
      <div class="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
        <div class="flex items-center gap-3">
          <span class="text-green-600 text-2xl">✓</span>
          <div class="flex-1">
            <div class="font-medium text-gray-900">Stock Analyses Database</div>
            <div class="text-sm text-gray-600">${detection.stockAnalysesDb.title}</div>
          </div>
          <span class="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">${detection.stockAnalysesDb.confidence}</span>
        </div>
      </div>
      <div class="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
        <div class="flex items-center gap-3">
          <span class="text-green-600 text-2xl">✓</span>
          <div class="flex-1">
            <div class="font-medium text-gray-900">Stock History Database</div>
            <div class="text-sm text-gray-600">${detection.stockHistoryDb.title}</div>
          </div>
          <span class="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">${detection.stockHistoryDb.confidence}</span>
        </div>
      </div>
      <div class="p-4 bg-green-50 border-2 border-green-200 rounded-lg">
        <div class="flex items-center gap-3">
          <span class="text-green-600 text-2xl">✓</span>
          <div class="flex-1">
            <div class="font-medium text-gray-900">Sage Stocks Page</div>
            <div class="text-sm text-gray-600">${detection.sageStocksPage.title}</div>
          </div>
          <span class="text-xs px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">${detection.sageStocksPage.confidence}</span>
        </div>
      </div>
    </div>
    <button
      id="step3-confirm"
      class="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
    >
      ✓ Confirm and Continue
    </button>
  `;

  // Setup confirm button
  const confirmBtn = results.querySelector('#step3-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%;"></span> Saving...';

      try {
        const response = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stockAnalysesDbId: detection.stockAnalysesDb.id,
            stockHistoryDbId: detection.stockHistoryDb.id,
            sageStocksPageId: detection.sageStocksPage.id,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Setup failed');
        }

        // Success! Advance to step 4
        await advanceToStep(4);
      } catch (error) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '✓ Confirm and Continue';
        showError(`Failed to save setup: ${error.message}`);
      }
    });
  }
}

function showManualFallback(partialDetection) {
  const loading = document.getElementById('step3-loading');
  const manual = document.getElementById('step3-manual');

  if (!loading || !manual) return;

  loading.classList.add('hidden');
  manual.classList.remove('hidden');

  manual.innerHTML = `
    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 rounded">
      <p class="font-medium text-yellow-900 mb-1">We couldn't auto-detect all your databases</p>
      <p class="text-sm text-yellow-800">This usually happens if you renamed them. No problem — just paste the URLs below:</p>
    </div>
    <div class="space-y-4 mb-6">
      <div>
        <label class="block text-sm font-medium mb-2 text-gray-700">Stock Analyses Database ID or URL</label>
        <input
          type="text"
          id="manual-analyses"
          placeholder="Paste database URL or ID here"
          value="${partialDetection?.stockAnalysesDb?.id || ''}"
          class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2 text-gray-700">Stock History Database ID or URL</label>
        <input
          type="text"
          id="manual-history"
          placeholder="Paste database URL or ID here"
          value="${partialDetection?.stockHistoryDb?.id || ''}"
          class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-2 text-gray-700">Sage Stocks Page ID or URL</label>
        <input
          type="text"
          id="manual-page"
          placeholder="Paste page URL or ID here"
          value="${partialDetection?.sageStocksPage?.id || ''}"
          class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
        />
      </div>
    </div>
    <button
      id="manual-submit"
      class="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
    >
      Save Configuration
    </button>
    <div id="manual-errors" class="hidden mt-4"></div>
  `;

  // Setup manual submit
  const submitBtn = manual.querySelector('#manual-submit');
  if (submitBtn) {
    submitBtn.addEventListener('click', async () => {
      const analysesInput = document.getElementById('manual-analyses');
      const historyInput = document.getElementById('manual-history');
      const pageInput = document.getElementById('manual-page');

      const stockAnalysesDbId = extractNotionId(analysesInput.value);
      const stockHistoryDbId = extractNotionId(historyInput.value);
      const sageStocksPageId = extractNotionId(pageInput.value);

      if (!stockAnalysesDbId || !stockHistoryDbId || !sageStocksPageId) {
        showManualError('Please fill in all fields');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%;"></span> Validating...';

      try {
        const response = await fetch('/api/setup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            stockAnalysesDbId,
            stockHistoryDbId,
            sageStocksPageId,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          if (data.errors) {
            showManualErrors(data.errors);
          } else {
            throw new Error(data.error || 'Validation failed');
          }
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Save Configuration';
          return;
        }

        // Success! Advance to step 4
        await advanceToStep(4);
      } catch (error) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Save Configuration';
        showManualError(`Failed to save setup: ${error.message}`);
      }
    });
  }
}

function extractNotionId(urlOrId) {
  if (!urlOrId) return '';
  urlOrId = urlOrId.trim();

  // If it's already a 32-char ID, return it
  const idPattern = /^[a-f0-9]{32}$/i;
  if (idPattern.test(urlOrId.replace(/-/g, ''))) {
    return urlOrId.replace(/-/g, '');
  }

  // Extract from URL
  const urlMatch = urlOrId.match(/[a-f0-9]{32}/i);
  if (urlMatch) {
    return urlMatch[0];
  }

  const urlWithDashesMatch = urlOrId.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  if (urlWithDashesMatch) {
    return urlWithDashesMatch[0].replace(/-/g, '');
  }

  return urlOrId;
}

function showManualError(message) {
  showManualErrors([{ field: 'Error', message }]);
}

function showManualErrors(errors) {
  const errorsDiv = document.getElementById('manual-errors');
  if (!errorsDiv) return;

  errorsDiv.innerHTML = `
    <div class="bg-red-50 border-l-4 border-red-400 p-4 rounded">
      <p class="font-medium text-red-800 mb-2">Validation errors:</p>
      <ul class="text-sm text-red-700 space-y-2">
        ${errors.map(error => `
          <li class="flex items-start gap-2">
            <span class="flex-shrink-0">•</span>
            <div>
              <strong>${error.field}:</strong> ${error.message}
              ${error.helpUrl ? `<br><a href="${error.helpUrl}" target="_blank" class="text-blue-600 hover:text-blue-700 underline text-xs">Learn more →</a>` : ''}
            </div>
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  errorsDiv.classList.remove('hidden');
}

// ============================================================================
// Step 4: Run First Analysis
// ============================================================================

function createStep4Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';
  section.innerHTML = `
    <div class="mb-6 p-6 rounded-lg border bg-indigo-50 border-indigo-200">
      <div class="flex items-start">
        <div class="text-3xl mr-4">📊</div>
        <div class="flex-1">
          <h3 class="font-bold text-gray-900 text-xl mb-2">Step 4: Run Your First Analysis</h3>
          <p class="text-gray-700 mb-4">
            Let's analyze your first stock! Enter any ticker symbol (like AAPL, TSLA, or GOOGL) and we'll generate a comprehensive analysis in your Notion workspace.
          </p>
          <div class="mb-4">
            <label class="block text-sm font-medium mb-2 text-gray-700">Enter Ticker Symbol</label>
            <input
              type="text"
              id="ticker-input"
              placeholder="e.g., AAPL"
              class="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all uppercase"
              maxlength="5"
            />
          </div>
          <button
            id="analyze-button"
            disabled
            class="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📊 Analyze Stock
          </button>
          <div id="analysis-status" class="hidden mt-4"></div>
        </div>
      </div>
    </div>
  `;

  // Setup event listeners
  setTimeout(() => {
    const input = section.querySelector('#ticker-input');
    const button = section.querySelector('#analyze-button');

    if (input && button) {
      input.addEventListener('input', () => {
        button.disabled = input.value.trim().length < 1;
      });

      button.addEventListener('click', async () => {
        await runFirstAnalysis(input.value.trim().toUpperCase());
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim().length >= 1) {
          runFirstAnalysis(input.value.trim().toUpperCase());
        }
      });
    }
  }, 0);

  return section;
}

async function runFirstAnalysis(ticker) {
  const button = document.getElementById('analyze-button');
  const statusDiv = document.getElementById('analysis-status');

  if (!button || !statusDiv) return;

  button.disabled = true;
  button.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px; border: 2px solid white; border-top-color: transparent; border-radius: 50%;"></span> Starting analysis...';

  statusDiv.classList.remove('hidden');
  statusDiv.innerHTML = `
    <div class="p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
      <p class="text-blue-800 font-medium">🚀 Starting analysis for ${ticker}...</p>
      <p class="text-sm text-blue-700 mt-1">This will take 60-140 seconds. Hang tight!</p>
    </div>
  `;

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Analysis failed');
    }

    // 🎉 CONFETTI TIME!
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });

    statusDiv.innerHTML = `
      <div class="p-4 bg-green-50 border-l-4 border-green-400 rounded">
        <p class="text-green-800 font-medium mb-2">🎉 Analysis complete for ${ticker}!</p>
        <p class="text-sm text-green-700 mb-3">Your analysis is ready in Notion. Click below to view it:</p>
        <button
          id="view-analysis"
          class="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
        >
          👁️ View Analysis in Notion
        </button>
      </div>
    `;

    // Setup view button
    const viewBtn = statusDiv.querySelector('#view-analysis');
    if (viewBtn && data.analysesPageId) {
      const notionUrl = `https://notion.so/${data.analysesPageId.replace(/-/g, '')}`;
      viewBtn.addEventListener('click', () => {
        window.open(notionUrl, '_blank');
        advanceToStep(5, { ticker, analysisUrl: notionUrl });
      });
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error);

    statusDiv.innerHTML = `
      <div class="p-4 bg-red-50 border-l-4 border-red-400 rounded">
        <p class="text-red-800 font-medium mb-1">❌ Analysis failed</p>
        <p class="text-sm text-red-700">${error.message}</p>
        <button
          id="retry-analysis"
          class="mt-3 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-all"
        >
          Try Again
        </button>
      </div>
    `;

    button.disabled = false;
    button.innerHTML = '📊 Analyze Stock';

    // Setup retry button
    const retryBtn = statusDiv.querySelector('#retry-analysis');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        runFirstAnalysis(ticker);
      });
    }
  }
}

// ============================================================================
// Step 5: View Results
// ============================================================================

function createStep5Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';

  const analysisUrl = currentState.setupProgress?.step5AnalysisUrl || '#';
  const ticker = currentState.setupProgress?.step4FirstTicker || 'your stock';

  section.innerHTML = `
    <div class="mb-6 p-6 rounded-lg border bg-purple-50 border-purple-200">
      <div class="text-center py-8">
        <div class="text-6xl mb-4">🎉</div>
        <h3 class="font-bold text-gray-900 text-2xl mb-2">Almost There!</h3>
        <p class="text-gray-700 text-lg mb-6">
          Your analysis for <strong>${ticker}</strong> is ready in your Notion workspace!
        </p>
        <button
          onclick="window.open('${analysisUrl}', '_blank'); document.getElementById('mark-complete').classList.remove('hidden');"
          class="inline-flex items-center px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg hover:shadow-xl text-lg"
        >
          👁️ Open Analysis in Notion
        </button>
        <div id="mark-complete" class="hidden mt-6">
          <p class="text-sm text-gray-600 mb-3">Seen your analysis? Let's finish setup!</p>
          <button
            onclick="completeSetup()"
            class="px-6 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-all"
          >
            ✓ I've Viewed My Analysis - Complete Setup
          </button>
        </div>
      </div>
    </div>
  `;

  return section;
}

async function completeSetup() {
  await advanceToStep(6);
}

// ============================================================================
// Step 6: Complete!
// ============================================================================

function createStep6Content() {
  const section = document.createElement('div');
  section.className = 'slide-in';
  section.innerHTML = `
    <div class="mb-6 p-6 rounded-lg border bg-green-50 border-green-200">
      <div class="text-center py-12">
        <div class="text-7xl mb-4">🎉</div>
        <h3 class="font-bold text-gray-900 text-3xl mb-3">You're All Set!</h3>
        <p class="text-gray-700 text-lg mb-6">
          Your Sage Stocks workspace is fully configured and ready for daily analysis.
        </p>
        <div class="bg-white border border-green-200 rounded-xl p-6 max-w-md mx-auto mb-6">
          <div class="space-y-3 text-left">
            <p class="text-green-800 flex items-center gap-2">
              <span class="font-medium">✓</span> Template duplicated and connected
            </p>
            <p class="text-green-800 flex items-center gap-2">
              <span class="font-medium">✓</span> Databases auto-detected and verified
            </p>
            <p class="text-green-800 flex items-center gap-2">
              <span class="font-medium">✓</span> First analysis completed
            </p>
          </div>
        </div>
        <p class="text-sm text-gray-600 mb-4">Redirecting to your analyzer in <span id="countdown">3</span> seconds...</p>
        <button
          onclick="window.location.href='/analyze.html'"
          class="inline-flex items-center px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl text-lg"
        >
          Go to Analyzer Now →
        </button>
      </div>
    </div>
  `;

  // Countdown redirect
  let countdown = 3;
  const countdownEl = document.getElementById('countdown');
  const interval = setInterval(() => {
    countdown--;
    if (countdownEl) {
      countdownEl.textContent = countdown;
    }
    if (countdown <= 0) {
      clearInterval(interval);
      window.location.href = '/analyze.html';
    }
  }, 1000);

  return section;
}

// ============================================================================
// Error Handling & UI Helpers
// ============================================================================

function showError(message) {
  const container = document.getElementById('setup-content');
  if (!container) return;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'bg-red-50 border-l-4 border-red-400 p-4 mb-6 rounded slide-in';
  errorDiv.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="text-red-600 text-xl flex-shrink-0">⚠️</span>
      <div class="flex-1">
        <p class="font-medium text-red-800">Error</p>
        <p class="text-sm text-red-700 mt-1">${message}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="text-red-600 hover:text-red-800 flex-shrink-0">
        ✕
      </button>
    </div>
  `;

  container.insertBefore(errorDiv, container.firstChild);
}

function showStatusMessage(status) {
  const container = document.getElementById('setup-content');
  if (!container) return;

  const messages = {
    pending: {
      icon: '⏳',
      title: 'Account Pending Approval',
      message: 'Your account has been created and is awaiting admin approval. You\'ll receive an email when approved (usually within 24 hours). Once approved, refresh this page to continue.',
      color: 'yellow'
    },
    denied: {
      icon: '❌',
      title: 'Access Denied',
      message: 'Your account application has been denied. Please contact support if you believe this is an error.',
      color: 'red'
    }
  };

  const msg = messages[status];
  if (!msg) return;

  container.innerHTML = `
    <div class="p-6 bg-${msg.color}-50 border border-${msg.color}-200 rounded-lg">
      <div class="flex items-start gap-4">
        <div class="text-3xl">${msg.icon}</div>
        <div class="flex-1">
          <p class="text-${msg.color}-800 font-medium text-lg">${msg.title}</p>
          <p class="text-${msg.color}-700 text-sm mt-1">${msg.message}</p>
          ${status === 'pending' ? `
            <button
              onclick="window.location.reload()"
              class="mt-4 px-4 py-2 bg-${msg.color}-600 text-white font-semibold rounded-lg hover:bg-${msg.color}-700 transition-all"
            >
              🔄 Refresh Status
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function getErrorMessage(errorCode) {
  const messages = {
    'access_denied': 'You denied access to your Notion workspace. Please try again and grant access.',
    'missing_code': 'Authorization code missing. Please try signing in again.',
    'server_config': 'Server configuration error. Please contact support.',
    'token_exchange_failed': 'Failed to complete authentication. Please try again.',
    'oauth_failed': 'Authentication failed. Please try again or contact support.',
    'unknown_status': 'Unexpected error occurred. Please contact support.',
  };

  return messages[errorCode] || 'An error occurred during setup. Please try again.';
}

// Make functions globally accessible for inline onclick handlers
window.completeSetup = completeSetup;
