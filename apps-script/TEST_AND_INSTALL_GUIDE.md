# Rushabh Workday App — Test and Install Guide

## Current PWA link

Open the published HTTPS launcher at https://codex26-dev.github.io/Employee_Attendance/ in Chrome on Android or Safari on iPhone. It opens the Google Apps Script workspace. Anyone with the link can reach the OTP screen. OTP is issued only for an email mapped to an active employee row (or configured manager email) in the connected Sheet; a Google sign-in is not required.

Use the Google Apps Script web app URL or the PWA link. Sign in with your registered work email and the email OTP. Employees do not need access to the spreadsheet itself.

## Manager setup before inviting employees

1. In the Google Sheet `Employees` tab, add staff emails in column F (`Email (optional, for reminders)`). Keep employee IDs; set manager Designation in column C to `Manager` or `Admin`.
2. The connected web app executes as its owner behind email OTP. Link access is public; the employee needs an active email row to receive an OTP, but does not need spreadsheet access or a particular Google account.
3. A manager can open **Team view → Attendance fence**, capture current-device GPS while at the office, review the pin, and save. Latitude, longitude, and radius can also be entered manually. Changes apply to the next punch.
4. Test OTP, schedules, attendance, progress, and manager views with a registered account. GPS permission is requested only after tapping the fence GPS button or Check in/Check out.

## Open and install the PWA

1. Open the published HTTPS app URL in Chrome on Android, or Safari on iPhone.
2. Sign in and confirm the app opens.
3. Android Chrome: open the browser menu and choose **Install app** or **Add to Home screen**. Confirm the prompt. If no install option appears, reload the HTTPS site and use the browser menu's **Add to Home screen** option.
4. iPhone Safari: tap **Share → Add to Home Screen → Add**.
5. Launch the new home-screen icon. Sign-in requires internet. GPS is optional for attendance; allow it only if the employee wants location captured.

## Schedule workflow

Managers can open **Team view**, select an employee, work date, start/end time, assignment, and optional location/instructions, then save. Employees can open **My schedule** to view their upcoming shifts. The first saved shift creates the `App_Schedule` sheet tab.

## Tasks, requests, reports, and reminders

- Managers assign tasks with a due date and priority from **Team view → Assign a task / target**. Employees use **My tasks** to update status and add a completion note. The first task read or assignment creates `App_Tasks`.
- Employees submit leave or one-day shift-change requests under **Requests**. Managers approve or decline them under **Team view → Pending leave and shift requests**. An approved shift change updates the one matching schedule for that employee/date; if there is no unique matching schedule, create or correct the schedule before approving. Leave approvals are recorded and exclude that employee from the scheduled-day missed-attendance digest; they do not delete or edit shifts.
- **Weekly team report** summarizes the previous seven days of check-ins, progress submissions, task completions, overdue tasks, and blocked reports.
- A manager can select **Enable email digests** to install a daily 6 PM digest and Monday 8 AM weekly report, using the project time zone and Apps Script owner’s MailApp quota. Daily missed-attendance/report checks apply to scheduled employees; approved leave is excluded. Digests go only to manager addresses from manager-designated employee rows and/or Settings → Manager Email. No test email is sent when enabling this.
- These new tabs (`App_Tasks`, `App_Requests`) are created on first use. Existing tabs are not cleared.

## Important deployment note

A PWA can be installed only from a published HTTPS URL with its manifest and service worker available. Android Chrome: open the link, choose **⋮ → Install app** or **Add to Home screen**. The Apps Script `/exec` URL and GitHub Pages URL are separate entry points to the same connected workspace.

## GPS alerts

The PWA does not continuously track employees or send background arrival/exit alerts. It reads location only after a user taps GPS capture or Check in/Check out. Background geofencing requires a native Android app with background-location permission and may deliver transitions with delay.
