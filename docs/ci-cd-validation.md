# CI/CD Pipeline Validation Guide

## Expected Workflow Behavior

When you push commits to the `main` branch or open a pull request targeting `main`, GitHub Actions will automatically trigger the CI/CD pipeline defined in `.github/workflows/main.yml`.

### Trigger Conditions
- **Push Events**: Any push to the `main` branch
- **Pull Requests**: Any PR targeting the `main` branch
- **Frequency**: Runs immediately after the event, typically within 1-2 minutes

### Workflow Structure
The pipeline consists of three parallel jobs that run independently:

1. **Build Job** (Required for success)
2. **Security Job** (Always runs, doesn't block main workflow)
3. **Secret Scan Job** (Always runs, doesn't block main workflow)

## Success Criteria

### Build Job (Primary)
For the workflow to pass, the **Build job** must complete successfully:

✅ **Expected Success Indicators:**
- `pnpm install` completes without dependency conflicts
- `pnpm lint` passes (no ESLint errors)
- `pnpm build` completes without TypeScript/Vite errors  
- `pnpm test:coverage` passes all tests
- Coverage threshold check passes (>80% line coverage)
- Codecov upload succeeds (if token configured)

✅ **Timeline (approximate):**
- Setup + Install: 1-3 minutes (faster with pnpm cache)
- Lint + Build: 30-60 seconds
- Tests + Coverage: 30-90 seconds
- Total: 2-5 minutes

### Security & Secret Scan Jobs
These run in parallel and don't block the main workflow:

- **Security Job**: Always runs, uploads vulnerability results to Security tab
- **Secret Scan Job**: Always runs, alerts if secrets are detected

## Viewing Results

### 1. GitHub Actions Tab
Navigate to your repository → **Actions** tab:

- **Green Checkmark**: All jobs passed ✅
- **Red X**: Build job failed ❌
- **Yellow Circle**: Some jobs failed but Build passed ⚠️
- Click on workflow run to see detailed logs for each step

### 2. Job-Specific Outputs

**Build Job Logs:**
```
✓ Checkout code
✓ Setup Node.js (pnpm cache hit)
✓ Install dependencies (X packages installed)
✓ Lint code (0 errors, 0 warnings)
✓ Build project (dist/ generated successfully)
✓ Run unit tests with coverage (X passed, 0 failed)
✓ Check coverage thresholds (85.2% - meeting threshold)
✓ Upload test coverage (Codecov upload successful)
```

**Security Job Logs:**
```
✓ Checkout code
✓ Run npm audit (scanning dependencies)
✓ Upload Trivy scan results (SARIF uploaded)
```

**Secret Scan Logs:**
```
✓ Checkout code
✓ Scan for secrets (No secrets detected)
```

## Common Success Patterns

### First Run After Setup
```
Build: ✅ 3m 45s
Security: ⚠️ 2m 12s (0 vulnerabilities)
Secret Scan: ✅ 45s
Overall: ✅ Passed
```

### With Codecov Token
```
Build: ✅ 4m 2s (Coverage uploaded to Codecov)
Security: ✅ 2m 15s
Secret Scan: ✅ 48s
Overall: ✅ Passed
```

## Failure Scenarios & Troubleshooting

### 1. Dependency Installation Fails
**Log Pattern:**
```
pnpm install --frozen-lockfile
ERR_PNPM_OUTDATED_LOCKFILE Cannot install with "frozen-lockfile"
```

**Fix:** 
- Run `pnpm install` locally to update lockfile
- Commit `pnpm-lock.yaml` changes
- Push updated lockfile

### 2. Linting Errors
**Log Pattern:**
```
pnpm lint
src/components/Button.tsx:10:5 error Unexpected unused variable
```

**Fix:**
- Run `pnpm lint:fix` locally
- Fix remaining issues manually
- Commit and push fixes

### 3. Build Errors
**Log Pattern:**
```
pnpm build
TypeScript error in src/routes/index.tsx
```

**Fix:**
- Run `pnpm build` locally to reproduce
- Fix TypeScript errors
- Run `pnpm check-types` to validate

### 4. Test Failures
**Log Pattern:**
```
pnpm test:coverage
FAIL  src/components/__tests__/Button.test.tsx > Button > renders with variant
```

**Fix:**
- Run `pnpm test` locally to debug
- Fix failing tests or update test expectations
- Ensure Button component exports are correct

### 5. Coverage Below Threshold
**Log Pattern:**
```
Check coverage thresholds
Coverage is 67.3% which is below 80% threshold
Error: Process completed with exit code 1
```

**Fix:**
- Run `pnpm test:coverage` locally
- Review `coverage/lcov-report/index.html` for uncovered lines
- Add missing test cases
- Aim for >80% line coverage

### 6. Codecov Upload Fails
**Log Pattern:**
```
Upload test coverage
Error: CODECOV_TOKEN not found
```

**Fix:**
- Go to GitHub Settings → Secrets and variables → Actions
- Add `CODECOV_TOKEN` secret from Codecov dashboard
- Workflow will work without it, but coverage won't upload

## Security & Secret Scan Results

### Security Vulnerabilities
- **Location**: Repository → Security → Code scanning alerts
- **Expected**: 0 high/critical vulnerabilities in dependencies
- **False Positives**: Can be dismissed in the Security tab
- **Real Issues**: Update vulnerable packages with `pnpm update`

### Secret Detection
- **Expected Result**: "No secrets detected"
- **If Detected**: Workflow will fail with specific file/line references
- **Fix**: Remove secrets from code, use environment variables instead
- **Prevention**: `.env` files are gitignored, never commit secrets

## Local Validation Commands

Before pushing, validate locally to avoid CI failures:

```bash
# Full CI simulation
pnpm install --frozen-lockfile
pnpm lint
pnpm build
pnpm test:coverage  # Check for >80% coverage
pnpm check-types

# Quick checks
pnpm check          # Lint + format + types
pnpm test           # Fast test run
```

## Post-Setup Validation Steps

After implementing Story 1.5, perform these validation steps:

1. **Commit and Push** a small change to trigger the workflow
2. **Monitor** the Actions tab for the running workflow
3. **Verify** all three jobs complete successfully
4. **Check** coverage report (if Codecov token configured)
5. **Review** Security tab for any alerts
6. **Document** any issues and resolutions

## Integration with Story 1.6 (Security Baseline)

This CI/CD pipeline addresses Story 1.6 requirements:

- ✅ Secret scanning integrated (Gitleaks)
- ✅ Vulnerability scanning integrated (Trivy)  
- ✅ No secrets in client-side code (enforced by scans)
- ✅ Environment variables validated at runtime (via config.ts)
- ✅ Security headers can be added to Vite config if needed
- ✅ Rate limiting can be added to API routes

## Next Steps After Validation

Once the pipeline runs successfully:

1. [ ] Configure `CODECOV_TOKEN` for coverage reporting
2. [ ] Set up branch protection rules requiring CI to pass
3. [ ] Add more comprehensive tests for core features
4. [ ] Consider adding deployment workflows for staging/production
5. [ ] Integrate with existing docs/testing-framework-integration.md

## Story 1.5 Completion Checklist

- [x] GitHub Actions workflow created for build/lint/tests
- [x] pnpm dependency caching configured
- [x] Coverage reports generated and uploaded
- [x] >80% coverage threshold enforced
- [x] Secret scanning integrated
- [x] Security vulnerability scanning integrated
- [x] Documentation created and referenced in README
- [x] Local validation commands documented

**Status**: Ready for validation push. All components implemented per acceptance criteria.