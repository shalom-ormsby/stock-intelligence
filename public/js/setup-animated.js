/**
 * Sage Stocks Animated Setup Flow
 * Features:
 * - 6-step subway map with GSAP animations
 * - Pulse animation on current step (like location marker)
 * - Spring physics transitions
 * - Confetti celebration at completion
 * - CTA to Sage Stocks page (no redirect)
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
  sageStocksPageUrl: null, // URL to Sage Stocks page in Notion
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Animated setup flow initialized');

  // Check for URL params (OAuth callback, errors, etc.)
  const params = new URLSearchParams(window.location.search);
  const stepParam = params.get('step');
  const errorParam = params.get('error');

  // Handle errors
  if (errorParam) {
    showError(getErrorMessage(errorParam));
  }

  // Load setup status from API
  await loadSetupStatus();

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
    console.log('📡 Loading setup status from API...');
    const response = await fetch('/api/setup/status');
    const data = await response.json();

    console.log('📡 API response:', response.status, data);

    if (!response.ok) {
      if (data.requiresAuth) {
        // No session - show Step 1 (pre-OAuth)
        console.log('🔒 No session, starting from Step 1');
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

    // Get Sage Stocks page URL if available
    if (data.user?.sageStocksPageId) {
      currentState.sageStocksPageUrl = `https://notion.so/${data.user.sageStocksPageId.replace(/-/g, '')}`;
    }

    console.log('✅ Setup status loaded:', {
      setupComplete: currentState.setupComplete,
      currentStep: currentState.currentStep,
      userStatus: currentState.user?.status,
    });

    // If setup is complete, show completion state (no redirect)
    if (data.setupComplete && currentState.currentStep === 6) {
      console.log('✓ Setup complete!');
      currentState.completedSteps = [1, 2, 3, 4, 5, 6];
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
// Subway Map Rendering with GSAP Animations
// ============================================================================

function renderSubwayMap() {
  const horizontalContainer = document.getElementById('steps-horizontal');
  const verticalContainer = document.getElementById('steps-vertical');

  if (!horizontalContainer || !verticalContainer) return;

  // Clear existing content
  horizontalContainer.innerHTML = '';
  verticalContainer.innerHTML = '';

  // Add continuous background line for horizontal layout
  const bgLine = document.createElement('div');
  bgLine.className = 'progress-line-bg';
  horizontalContainer.appendChild(bgLine);

  // Add filled progress line for horizontal layout
  const fillLine = document.createElement('div');
  fillLine.className = 'progress-line-fill';
  fillLine.id = 'progress-fill';
  horizontalContainer.appendChild(fillLine);

  // Calculate progress (fill up to but not including current step)
  // Line runs from center of first circle (8.33%) to center of last circle (91.67%)
  // That's 83.33% of total width, divided into 5 segments
  const completedCount = currentState.completedSteps.length;
  const totalSteps = STEPS.length;
  const lineSpan = (10 / 12) * 100; // 83.33%
  const progressPercent = (completedCount / (totalSteps - 1)) * lineSpan;
  fillLine.style.width = `${progressPercent}%`;

  // Render horizontal (desktop)
  STEPS.forEach((step, index) => {
    const state = getStepState(step.number);
    horizontalContainer.appendChild(createStepIndicatorHorizontal(step, state, index));
  });

  // Render vertical (mobile/tablet)
  STEPS.forEach((step, index) => {
    const state = getStepState(step.number);
    const isLast = index === STEPS.length - 1;
    verticalContainer.appendChild(createStepIndicatorVertical(step, state, isLast, index));
  });

  // Animate in with GSAP
  gsap.from('.step-indicator', {
    scale: 0,
    duration: 0.4,
    stagger: 0.1,
    ease: 'back.out(1.7)', // Spring physics
  });
}

function createStepIndicatorHorizontal(step, state, index) {
  const container = document.createElement('div');
  container.className = 'flex-1 text-center relative';

  const indicator = document.createElement('div');
  indicator.className = `step-indicator ${state} mx-auto`;
  indicator.id = `step-${step.number}-indicator`;

  if (state === 'complete') {
    indicator.innerHTML = '<span style="position:relative;z-index:1;">✓</span>';
  } else if (state === 'in-progress') {
    indicator.innerHTML = `<span style="position:relative;z-index:1;">${step.number}</span>`;
  } else {
    indicator.textContent = step.number;
  }

  const title = document.createElement('div');
  title.className = 'mt-4 font-semibold text-sm';
  title.textContent = step.title;

  const description = document.createElement('div');
  description.className = 'text-xs text-gray-400 mt-1';
  description.textContent = `${step.icon} ${step.description}`;

  const duration = document.createElement('div');
  duration.className = 'text-xs text-gray-500 mt-1';
  duration.textContent = step.duration ? `⏱️ ${step.duration}` : '';

  container.appendChild(indicator);
  container.appendChild(title);
  container.appendChild(description);
  if (step.duration) container.appendChild(duration);

  return container;
}

function createStepIndicatorVertical(step, state, isLast, index) {
  const container = document.createElement('div');
  container.className = 'relative flex items-start gap-4';

  const indicatorWrapper = document.createElement('div');
  indicatorWrapper.className = 'relative flex-shrink-0';

  const indicator = document.createElement('div');
  indicator.className = `step-indicator ${state}`;

  if (state === 'complete') {
    indicator.innerHTML = '<span style="position:relative;z-index:1;">✓</span>';
  } else if (state === 'in-progress') {
    indicator.innerHTML = `<span style="position:relative;z-index:1;">${step.number}</span>`;
  } else {
    indicator.textContent = step.number;
  }

  indicatorWrapper.appendChild(indicator);

  // Add connector line for vertical layout (except last step)
  if (!isLast) {
    const connector = document.createElement('div');
    connector.className = `subway-connector-v ${state === 'complete' ? 'complete' : ''}`;
    indicatorWrapper.appendChild(connector);
  }

  const textContent = document.createElement('div');
  textContent.className = 'flex-1 pt-3';

  const title = document.createElement('div');
  title.className = 'font-semibold text-sm';
  title.textContent = step.title;

  const description = document.createElement('div');
  description.className = 'text-xs text-gray-400 mt-1';
  description.textContent = `${step.icon} ${step.description}`;

  const duration = document.createElement('div');
  duration.className = 'text-xs text-gray-500 mt-1';
  duration.textContent = step.duration ? `⏱️ ${step.duration}` : '';

  textContent.appendChild(title);
  textContent.appendChild(description);
  if (step.duration) textContent.appendChild(duration);

  container.appendChild(indicatorWrapper);
  container.appendChild(textContent);

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

// ============================================================================
// Animate Step Completion with GSAP
// ============================================================================

function animateStepCompletion(stepNumber) {
  const indicator = document.getElementById(`step-${stepNumber}-indicator`);
  if (!indicator) return;

  // Spring physics bounce
  gsap.to(indicator, {
    scale: 1.2,
    duration: 0.2,
    ease: 'back.out(3)',
    onComplete: () => {
      gsap.to(indicator, {
        scale: 1,
        duration: 0.3,
        ease: 'elastic.out(1, 0.5)',
      });
    },
  });

  // Change state
  indicator.classList.remove('in-progress', 'pending');
  indicator.classList.add('complete');
  indicator.innerHTML = '<span style="position:relative;z-index:1;">✓</span>';

  // Animate progress line fill
  const fillLine = document.getElementById('progress-fill');
  if (fillLine) {
    const completedCount = currentState.completedSteps.length;
    const totalSteps = STEPS.length;
    const lineSpan = (10 / 12) * 100; // 83.33%
    const progressPercent = (completedCount / (totalSteps - 1)) * lineSpan;

    gsap.to(fillLine, {
      width: `${progressPercent}%`,
      duration: 0.6,
      ease: 'power2.out',
    });
  }

  // Animate vertical connector lines
  const connectors = document.querySelectorAll('.subway-connector-v');
  connectors.forEach((connector, index) => {
    if (index < stepNumber - 1) {
      connector.classList.add('complete');
    }
  });
}

// ============================================================================
// Step Content Rendering
// ============================================================================

function renderStepContent() {
  const container = document.getElementById('setup-content');
  if (!container) return;

  // Fade out old content
  gsap.to(container, {
    opacity: 0,
    y: 20,
    duration: 0.2,
    onComplete: () => {
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

      // Fade in new content
      gsap.to(container, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'back.out(1.7)',
      });
    },
  });
}

// ============================================================================
// Step 1: Sign In with Notion (OAuth)
// ============================================================================

function createStep1Content() {
  const section = document.createElement('div');
  section.innerHTML = `
    <div class="text-center">
      <div class="text-5xl mb-4">🔗</div>
      <h3 class="text-2xl font-bold mb-4">Sign In with Notion</h3>
      <p class="text-gray-400 mb-6 max-w-md mx-auto">
        Connect your Notion workspace to get started. This allows Sage Stocks to read and write to your databases.
      </p>
      <a
        href="/api/auth/authorize"
        class="btn-primary px-8 py-4 rounded-xl font-semibold text-lg inline-flex items-center gap-2"
      >
        <span>Sign in with Notion</span>
        <span>→</span>
      </a>
    </div>
  `;
  return section;
}

// ============================================================================
// Step 2: Duplicate Template
// ============================================================================

function createStep2Content() {
  const section = document.createElement('div');
  section.innerHTML = `
    <div class="text-center">
      <div class="text-5xl mb-4">📄</div>
      <h3 class="text-2xl font-bold mb-4">Duplicate the Notion Template</h3>
      <p class="text-gray-400 mb-6 max-w-md mx-auto">
        Get your own copy of the Sage Stocks template. This includes the Stock Analyses database, Stock History database, and the Sage Stocks page.
      </p>
      <div class="glass-card-light rounded-xl p-4 mb-6 max-w-md mx-auto">
        <p class="text-sm text-blue-300">
          💡 <strong>Keep this tab open!</strong> After duplicating, return here to continue setup.
        </p>
      </div>
      <a
        href="${TEMPLATE_URL}"
        target="_blank"
        rel="noopener noreferrer"
        class="btn-primary px-8 py-4 rounded-xl font-semibold text-lg inline-block mb-6"
      >
        📄 Duplicate Template →
      </a>
      <div class="max-w-md mx-auto">
        <div class="flex items-center gap-3 justify-center mb-4">
          <input type="checkbox" id="step2-confirm" class="w-5 h-5 rounded focus:ring-2 focus:ring-blue-500" />
          <label for="step2-confirm" class="text-gray-300 cursor-pointer">I've duplicated the template</label>
        </div>
        <button
          id="step2-continue"
          disabled
          class="btn-success px-8 py-3 rounded-xl font-semibold w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue to Verification
        </button>
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
        button.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px;"></span> Starting verification...';
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
  section.innerHTML = `
    <div id="step3-container" class="text-center">
      <div class="text-5xl mb-4">🔍</div>
      <h3 class="text-2xl font-bold mb-4">Verifying Your Setup</h3>
      <div id="step3-loading" class="py-8">
        <div class="spinner mx-auto" style="width: 48px; height: 48px;"></div>
        <p class="text-gray-300 font-medium mt-4">Searching your workspace for databases...</p>
        <p class="text-sm text-gray-500 mt-2">This takes about 30 seconds. Don't worry, we're only reading — no changes yet.</p>
      </div>
      <div id="step3-results" class="hidden">
        <!-- Results will be populated here -->
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
      // Already setup, animate through remaining steps
      await animateCompletionSequence();
      return;
    }

    // Show results for confirmation
    showDetectionResults(data.detection);
  } catch (error) {
    console.error('❌ Auto-detection failed:', error);
    showError(`Auto-detection failed: ${error.message}. Please try again.`);
  }
}

function showDetectionResults(detection) {
  const loading = document.getElementById('step3-loading');
  const results = document.getElementById('step3-results');

  if (!loading || !results) return;

  loading.classList.add('hidden');
  results.classList.remove('hidden');

  results.innerHTML = `
    <div class="max-w-lg mx-auto">
      <div class="space-y-3 mb-6">
        <div class="glass-card-light p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <span class="text-green-400 text-2xl">✓</span>
            <div class="flex-1 text-left">
              <div class="font-medium">Stock Analyses Database</div>
              <div class="text-sm text-gray-400">${detection.stockAnalysesDb.title}</div>
            </div>
          </div>
        </div>
        <div class="glass-card-light p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <span class="text-green-400 text-2xl">✓</span>
            <div class="flex-1 text-left">
              <div class="font-medium">Stock History Database</div>
              <div class="text-sm text-gray-400">${detection.stockHistoryDb.title}</div>
            </div>
          </div>
        </div>
        <div class="glass-card-light p-4 rounded-xl">
          <div class="flex items-center gap-3">
            <span class="text-green-400 text-2xl">✓</span>
            <div class="flex-1 text-left">
              <div class="font-medium">Sage Stocks Page</div>
              <div class="text-sm text-gray-400">${detection.sageStocksPage.title}</div>
            </div>
          </div>
        </div>
      </div>
      <button
        id="step3-confirm"
        class="btn-success w-full px-6 py-4 rounded-xl font-semibold"
      >
        ✓ Confirm and Continue
      </button>
    </div>
  `;

  // Animate in results
  gsap.from('#step3-results > div', {
    y: 20,
    opacity: 0,
    duration: 0.5,
    ease: 'back.out(1.7)',
  });

  // Setup confirm button
  const confirmBtn = results.querySelector('#step3-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<span class="inline-block spinner mr-2" style="width: 16px; height: 16px;"></span> Saving...';

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

        // Store Sage Stocks page URL
        currentState.sageStocksPageUrl = `https://notion.so/${detection.sageStocksPage.id.replace(/-/g, '')}`;

        // Success! Animate through remaining steps
        await animateCompletionSequence();
      } catch (error) {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '✓ Confirm and Continue';
        showError(`Failed to save setup: ${error.message}`);
      }
    });
  }
}

// ============================================================================
// Animated Completion Sequence (Steps 3-6)
// ============================================================================

async function animateCompletionSequence() {
  // Animate step 3 completion
  animateStepCompletion(3);
  currentState.completedSteps.push(3);
  await sleep(600);

  // Advance to step 4
  currentState.currentStep = 4;
  currentState.completedSteps.push(4);
  animateStepCompletion(4);
  renderSubwayMap();
  await sleep(600);

  // Advance to step 5
  currentState.currentStep = 5;
  currentState.completedSteps.push(5);
  animateStepCompletion(5);
  renderSubwayMap();
  await sleep(600);

  // Advance to step 6
  currentState.currentStep = 6;
  currentState.completedSteps.push(6);
  animateStepCompletion(6);
  renderSubwayMap();

  // Render step 6 content (with confetti)
  renderStepContent();

  // Update backend state
  await advanceToStep(6);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Step 4-5: Skipped (auto-animated in sequence)
// ============================================================================

function createStep4Content() {
  return document.createElement('div');
}

function createStep5Content() {
  return document.createElement('div');
}

// ============================================================================
// Step 6: Complete! (with Confetti + CTA)
// ============================================================================

function createStep6Content() {
  const section = document.createElement('div');
  section.innerHTML = `
    <div class="text-center py-12">
      <div class="text-7xl mb-6">🎉</div>
      <h3 class="text-4xl font-bold mb-4">
        <span class="gradient-text">You're All Set!</span>
      </h3>
      <p class="text-gray-400 text-lg mb-8 max-w-md mx-auto">
        Your Sage Stocks workspace is fully configured and ready for stock analysis.
      </p>
      <div class="glass-card-light rounded-xl p-6 max-w-md mx-auto mb-8">
        <div class="space-y-3 text-left">
          <p class="text-green-400 flex items-center gap-2">
            <span class="font-medium">✓</span> Template duplicated and connected
          </p>
          <p class="text-green-400 flex items-center gap-2">
            <span class="font-medium">✓</span> Databases auto-detected and verified
          </p>
          <p class="text-green-400 flex items-center gap-2">
            <span class="font-medium">✓</span> Setup complete
          </p>
        </div>
      </div>
      <div class="flex flex-col gap-4 max-w-md mx-auto">
        <a
          href="${currentState.sageStocksPageUrl || '#'}"
          target="_blank"
          rel="noopener noreferrer"
          class="btn-primary px-8 py-4 rounded-xl font-bold text-lg inline-flex items-center justify-center gap-2"
        >
          <span>📄 Open Your Sage Stocks Page</span>
          <span>→</span>
        </a>
        <a
          href="/analyze.html"
          class="btn-success px-8 py-4 rounded-xl font-semibold text-lg inline-block"
        >
          Start Analyzing Stocks
        </a>
      </div>
    </div>
  `;

  // Trigger confetti after a short delay
  setTimeout(() => {
    // Multiple confetti bursts for extra celebration
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#4d9cff', '#b57dff', '#00d66c', '#5dffac', '#ff7fc4'],
    });

    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 100,
        origin: { y: 0.6 },
        colors: ['#4d9cff', '#b57dff', '#00d66c', '#5dffac', '#ff7fc4'],
      });
    }, 250);

    setTimeout(() => {
      confetti({
        particleCount: 60,
        spread: 120,
        origin: { y: 0.6 },
        colors: ['#4d9cff', '#b57dff', '#00d66c', '#5dffac', '#ff7fc4'],
      });
    }, 500);
  }, 300);

  return section;
}

// ============================================================================
// Error Handling
// ============================================================================

function showError(message) {
  const container = document.getElementById('setup-content');
  if (!container) return;

  const errorDiv = document.createElement('div');
  errorDiv.className = 'glass-card-light p-4 rounded-xl mb-6 border border-red-500';
  errorDiv.innerHTML = `
    <div class="flex items-start gap-3">
      <span class="text-red-400 text-xl flex-shrink-0">⚠️</span>
      <div class="flex-1">
        <p class="font-medium text-red-300">Error</p>
        <p class="text-sm text-gray-400 mt-1">${message}</p>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" class="text-red-400 hover:text-red-300 flex-shrink-0">
        ✕
      </button>
    </div>
  `;

  container.insertBefore(errorDiv, container.firstChild);

  // Animate in
  gsap.from(errorDiv, {
    y: -20,
    opacity: 0,
    duration: 0.3,
    ease: 'back.out(1.7)',
  });
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
