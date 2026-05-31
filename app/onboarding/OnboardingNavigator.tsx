import React, { useState } from 'react';
import { WelcomeScreen } from './WelcomeScreen';
import { PermissionsScreen } from './PermissionsScreen';
import { OverlayPermissionScreen } from './OverlayPermissionScreen';
import { ModelDownloadScreen } from './ModelDownloadScreen';
import { ReadyScreen } from './ReadyScreen';
import { getSettings } from '../../src/store/settingsStore';

type OnboardingStep = 'welcome' | 'permissions' | 'overlay' | 'model-download' | 'ready';

interface Props {
  onComplete: () => void;
}

/**
 * Orchestrates the onboarding screens in sequence:
 *   Welcome -> Permissions -> Overlay -> Model Download (skipped if cloud is configured) -> Ready
 *
 * Calls `onComplete` when the user finishes. The parent (App.tsx) is
 * responsible for persisting the completion flag via onboardingStore.
 */
export function OnboardingNavigator({ onComplete }: Props) {
  const [step, setStep] = useState<OnboardingStep>('welcome');

  function afterOverlay() {
    const s = getSettings();
    if (s.cloudFallback && s.cloudApiKey.trim().length > 0) {
      setStep('ready');
    } else {
      setStep('model-download');
    }
  }

  switch (step) {
    case 'welcome':
      return <WelcomeScreen onNext={() => setStep('permissions')} />;

    case 'permissions':
      return <PermissionsScreen onNext={() => setStep('overlay')} />;

    case 'overlay':
      return <OverlayPermissionScreen onNext={afterOverlay} />;

    case 'model-download':
      return <ModelDownloadScreen onNext={() => setStep('ready')} />;

    case 'ready':
      return <ReadyScreen onFinish={onComplete} />;
  }
}
