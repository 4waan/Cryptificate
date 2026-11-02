/**
 * Export report: the same self-contained HTML evidence report the command
 * line writes with --format html and every evidence bundle carries as
 * report.html, rendered in the browser from the report on screen.
 */
import { renderReportHtml, reportHtmlFileName, type HtmlReportOptions, type Report } from '@cryptificate/schema';
import type { Run } from '../state/store';
import { downloadText } from './download';

/** Options that say where the report on screen came from. */
export function reportHtmlOptions(run: Pick<Run, 'source' | 'recordingId' | 'jobId'>, report: Report): HtmlReportOptions {
  if (run.source === 'replay') {
    return {
      context: `recorded run${run.recordingId ? ` ${run.recordingId}` : ''}`,
      ...(run.recordingId ? { bundleName: `${run.recordingId}.tar.gz` } : {}),
    };
  }
  // the service names a downloaded bundle after its job
  return { bundleName: `cryptificate-${run.jobId ?? report.id}.tar.gz` };
}

export function reportHtml(report: Report, run: Pick<Run, 'source' | 'recordingId' | 'jobId'>): string {
  return renderReportHtml(report, reportHtmlOptions(run, report));
}

export function exportReport(report: Report, run: Run): void {
  downloadText(reportHtmlFileName(report), reportHtml(report, run), 'text/html;charset=utf-8');
}
