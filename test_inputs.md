# Test Inputs for LicenseLogic

## 1. Register a Work

**Method:** `register_work`

| Parameter | Value |
|-----------|-------|
| `work_url` | `https://www.apache.org/licenses/LICENSE-2.0.txt` |
| `work_desc` | `The Apache License 2.0 full legal text. Infringement means reproducing substantial portions of this license text verbatim or with minor rewording, especially the grant of rights, conditions, and limitation of liability sections.` |
| `license_price` | `1000` |
| `penalty_amount` | `5000` |

**Expected:** Returns `"work_0"`.

## 2. Purchase a License

**Method:** `purchase_license`

| Parameter | Value |
|-----------|-------|
| `work_id` | `work_0` |
| Send value | `1000` (or more) |

**Expected:** Transaction succeeds, caller is recorded as licensee.

## 3. Scan for Infringement — Three Scenarios

### Scenario A: Clear Infringement

A page that hosts the exact same Apache 2.0 license text.

**Method:** `scan_for_infringement`

| Parameter | Value |
|-----------|-------|
| `work_id` | `work_0` |
| `suspect_url` | `https://raw.githubusercontent.com/apache/arrow/main/LICENSE.txt` |

**Expected:** Verdict = `INFRINGEMENT`, similarity >= 70. The suspect page contains the full Apache 2.0 text, which is a verbatim copy.

### Scenario B: Clearly Clean

A page with completely unrelated content.

**Method:** `scan_for_infringement`

| Parameter | Value |
|-----------|-------|
| `work_id` | `work_0` |
| `suspect_url` | `https://www.example.com` |

**Expected:** Verdict = `CLEAR`, similarity < 40. example.com has no relation to the Apache license.

### Scenario C: Borderline / Uncertain

A page with a different open-source license (MIT) that shares some legal phrasing but is a distinct work.

**Method:** `scan_for_infringement`

| Parameter | Value |
|-----------|-------|
| `work_id` | `work_0` |
| `suspect_url` | `https://opensource.org/licenses/MIT` |

**Expected:** Verdict = `UNCERTAIN` or `CLEAR`, similarity 20-50. The MIT license shares some common legal language ("AS IS", warranty disclaimers) but is a fundamentally different and much shorter license.

## 4. View Methods

After running the scans above:

- `get_work("work_0")` — returns JSON with all work details and infringement count
- `get_infringement_count("work_0")` — returns the number of confirmed infringements
- `get_last_verdict("work_0", "<suspect_hash>")` — returns the stored verdict JSON (use the hash from the scan result)
