/**
 * Export report: the self-contained HTML evidence report of the run on
 * screen.
 *
 * For a live run it is the page the local service serves at
 * /api/jobs/:id/report.html, byte for byte the report.html of the job's
 * evidence bundle (path-scrubbed, with the toolchain pins recorded when the
 * job ran). A recorded (replay) run has no service behind it, so its page is
 * rendered in the browser by the same renderer from the recorded report.json;
 * it has no "Recorded toolchain (toolchain.json)" section and no path
 * scrubbing beyond what the recording already applied.
 */
import { renderReportHtml, reportHtmlFileName, type HtmlReportOptions, type Report } from '@cryptificate/schema';
import { reportHtmlUrl } from '../data/api';
import type { Run } from '../state/store';
import { downloadText } from './download';

type RunSource = Pick<Run, 'source' | 'recordingId' | 'jobId'>;

/** The service URL of a live run's report.html; null when the page is rendered in the browser. */
export function serverReportUrl(run: RunSource): string | null {
  return run.source === 'live' && run.jobId ? reportHtmlUrl(run.jobId) : null;
}

/** Options for a page rendered in the browser, saying where the report on screen came from. */
export function reportHtmlOptions(run: RunSource): HtmlReportOptions {
  if (run.source === 'replay') {
    return {
      context: `recorded run${run.recordingId ? ` ${run.recordingId}` : ''}`,
      ...(run.recordingId ? { bundleName: `${run.recordingId}.tar.gz` } : {}),
    };
  }
  return {};
}

/** The page rendered in the browser (recorded runs, or a live run without a job id). */
export function reportHtml(report: Report, run: RunSource): string {
  return renderReportHtml(report, reportHtmlOptions(run));
}

export function exportReport(report: Report, run: Run): void {
  downloadText(reportHtmlFileName(report), reportHtml(report, run), 'text/html;charset=utf-8');
}
