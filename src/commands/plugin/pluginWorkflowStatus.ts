import type { TextProps } from '../../ink.js';

type PluginWorkflowStatusInput = {
  isEnabled: boolean;
  errorCount?: number;
  pendingToggle?: 'will-enable' | 'will-disable';
  pendingUpdate?: boolean;
};

export type PluginWorkflowStatus = {
  label: string;
  color: TextProps['color'];
  recovery?: string;
};

export function getPluginWorkflowStatus(input: PluginWorkflowStatusInput): PluginWorkflowStatus {
  if (input.errorCount && input.errorCount > 0) {
    return {
      label: `${input.errorCount} ${input.errorCount === 1 ? 'error' : 'errors'}`,
      color: 'error',
      recovery: 'Open details to review recovery action',
    };
  }

  if (input.pendingToggle === 'will-enable') {
    return {
      label: 'Will enable',
      color: 'suggestion',
      recovery: 'Run /reload-plugins to apply',
    };
  }

  if (input.pendingToggle === 'will-disable') {
    return {
      label: 'Will disable',
      color: 'warning',
      recovery: 'Run /reload-plugins to apply',
    };
  }

  if (input.pendingUpdate) {
    return {
      label: 'Marked for update',
      color: 'suggestion',
      recovery: 'Select Update to install latest version',
    };
  }

  return input.isEnabled
    ? { label: 'Enabled', color: 'success' }
    : { label: 'Disabled', color: 'warning', recovery: 'Select Enable to use this plugin' };
}
