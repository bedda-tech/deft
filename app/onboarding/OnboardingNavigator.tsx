import React, { useState } from 'react';
import { WelcomeScreen } from './WelcomeScreen';
import { PermissionsScreen } from './PermissionsScreen';
import { ModelDownloadScreen } from './ModelDownloadScreen';
import { ReadyScreen } from './ReadyScreen';

type OnboardingStep = 'welcome' | 'permissions' | 'model-download' | 'ready';

interface Props {
  onComplete: () => void;
}

/**
 * Orchestrates the four onboarding screens in sequence:
 *   Welcome -> Permissions -> Model Download -> Ready
 *
 * Calls `onComplete` when the user finishes. The parent (App.tsx) is
 * responsible for persisting the completion flag via onboardingStore.
 */
export function OnboardingNavigator({ onComplete }: Props) {
  const [step, setStep] = useState<OnboardingStep>('welcome');

  switch (step) {
    case 'welcome':
      return <WelcomeScreen onNext={() => setStep('permissions')} />;

    case 'permissions':
      return <PermissionsScreen onNext={() => setStep('model-download')} />;

    case 'model-download':
      return <ModelDownloadScreen onNext={() => setStep('ready')} />;

    case 'ready':
      return <ReadyScreen onFinish={onComplete} />;
  }
}
