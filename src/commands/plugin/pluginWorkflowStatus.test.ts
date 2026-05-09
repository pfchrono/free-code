import { describe, expect, it } from 'bun:test';

import { getPluginWorkflowStatus } from './pluginWorkflowStatus.js';

describe('getPluginWorkflowStatus', () => {
  it('prioritizes load errors over enabled state', () => {
    expect(getPluginWorkflowStatus({ isEnabled: true, errorCount: 2 })).toEqual({
      label: '2 errors',
      color: 'error',
      recovery: 'Open details to review recovery action',
    });
  });

  it('surfaces pending reload actions', () => {
    expect(getPluginWorkflowStatus({ isEnabled: false, pendingToggle: 'will-enable' })).toEqual({
      label: 'Will enable',
      color: 'suggestion',
      recovery: 'Run /reload-plugins to apply',
    });
  });

  it('describes disabled recovery', () => {
    expect(getPluginWorkflowStatus({ isEnabled: false })).toEqual({
      label: 'Disabled',
      color: 'warning',
      recovery: 'Select Enable to use this plugin',
    });
  });
});
