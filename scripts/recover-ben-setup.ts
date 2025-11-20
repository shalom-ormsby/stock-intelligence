/**
 * Recovery Script for Ben Wen's Setup
 *
 * Purpose: Manually run auto-detection and populate database IDs for Ben's account
 *
 * Problem: Ben completed OAuth but auto-detection never ran due to missing
 * triggerAutoDetection() function in setup-flow.js. His database IDs are all empty,
 * blocking analysis attempts.
 *
 * Solution: This script manually runs the same detection logic that should have
 * run during setup, then updates Ben's Beta Users record with the detected IDs.
 *
 * Usage:
 *   npx ts-node scripts/recover-ben-setup.ts
 *
 * Can also be adapted for other affected users by changing the email constant.
 */

import { getUserByEmail, decryptToken, updateUserDatabaseIds } from '../lib/auth';
import { autoDetectTemplate } from '../lib/template-detection';
import { log, LogLevel } from '../lib/logger';

// User to recover
const AFFECTED_USER_EMAIL = 'ben@example.com'; // Replace with Ben's actual email

async function recoverSetup() {
  console.log('='.repeat(60));
  console.log('Setup Recovery Script - Auto-Detection & Database ID Population');
  console.log('='.repeat(60));
  console.log();

  try {
    // Step 1: Get user data
    console.log(`📧 Looking up user: ${AFFECTED_USER_EMAIL}`);
    const user = await getUserByEmail(AFFECTED_USER_EMAIL);

    if (!user) {
      console.error(`❌ User not found: ${AFFECTED_USER_EMAIL}`);
      console.log('\nPlease verify the email address and try again.');
      process.exit(1);
    }

    console.log(`✅ User found: ${user.name} (${user.id})`);
    console.log(`   Status: ${user.status}`);
    console.log(`   Workspace ID: ${user.workspaceId}`);
    console.log(`   Notion User ID: ${user.notionUserId}`);
    console.log();

    // Step 2: Check current database IDs
    console.log('📊 Current database configuration:');
    console.log(`   Stock Analyses DB ID: ${user.stockAnalysesDbId || '❌ EMPTY'}`);
    console.log(`   Stock History DB ID: ${user.stockHistoryDbId || '❌ EMPTY'}`);
    console.log(`   Market Context DB ID: ${user.marketContextDbId || '❌ EMPTY'}`);
    console.log(`   Sage Stocks Page ID: ${user.sageStocksPageId || '❌ EMPTY'}`);
    console.log();

    // Check if already configured
    if (user.stockAnalysesDbId && user.stockHistoryDbId && user.sageStocksPageId) {
      console.log('✅ User already has database IDs configured!');
      console.log('   No recovery needed. Exiting.');
      process.exit(0);
    }

    // Step 3: Decrypt OAuth token
    console.log('🔓 Decrypting OAuth token...');
    const userToken = await decryptToken(user.accessToken);
    console.log('✅ Token decrypted successfully');
    console.log();

    // Step 4: Run auto-detection
    console.log('🔍 Running auto-detection...');
    const detection = await autoDetectTemplate(userToken);

    console.log('📡 Detection results:');
    console.log(`   Stock Analyses DB: ${detection.stockAnalysesDb ? `✅ ${detection.stockAnalysesDb.id}` : '❌ Not found'}`);
    console.log(`   Stock History DB: ${detection.stockHistoryDb ? `✅ ${detection.stockHistoryDb.id}` : '❌ Not found'}`);
    console.log(`   Sage Stocks Page: ${detection.sageStocksPage ? `✅ ${detection.sageStocksPage.id}` : '❌ Not found'}`);
    console.log(`   Needs Manual Entry: ${detection.needsManual ? '⚠️  Yes' : '✅ No'}`);
    console.log();

    // Step 5: Validate detection results
    if (detection.needsManual || !detection.stockAnalysesDb || !detection.stockHistoryDb || !detection.sageStocksPage) {
      console.error('❌ Auto-detection incomplete - missing required databases');
      console.log();
      console.log('Possible reasons:');
      console.log('  1. User did not duplicate the Sage Stocks template');
      console.log('  2. Template was renamed or databases were deleted');
      console.log('  3. OAuth integration permissions are insufficient');
      console.log();
      console.log('Next steps:');
      console.log('  1. Verify user has Sage Stocks template in their workspace');
      console.log('  2. Check OAuth integration has access to the workspace');
      console.log('  3. Try manual database ID entry as fallback');
      process.exit(1);
    }

    // Step 6: Update user record with detected IDs
    console.log('💾 Updating Beta Users record with detected database IDs...');

    const updateData = {
      stockAnalysesDbId: detection.stockAnalysesDb.id,
      stockHistoryDbId: detection.stockHistoryDb.id,
      sageStocksPageId: detection.sageStocksPage.id,
      setupCompletedAt: new Date().toISOString(),
    };

    await updateUserDatabaseIds(user.id, updateData);

    console.log('✅ Database IDs saved successfully!');
    console.log();

    // Step 7: Log success
    log(LogLevel.INFO, 'Setup recovery completed', {
      userId: user.id,
      email: AFFECTED_USER_EMAIL,
      recoveredIds: {
        stockAnalysesDbId: updateData.stockAnalysesDbId,
        stockHistoryDbId: updateData.stockHistoryDbId,
        sageStocksPageId: updateData.sageStocksPageId,
      },
    });

    // Step 8: Summary
    console.log('='.repeat(60));
    console.log('✅ Recovery Complete!');
    console.log('='.repeat(60));
    console.log();
    console.log('User can now:');
    console.log('  1. Visit https://sagestocks.vercel.app/analyze.html');
    console.log('  2. Run stock analyses successfully');
    console.log('  3. View results in their Notion workspace');
    console.log();
    console.log('Database IDs configured:');
    console.log(`  • Stock Analyses: ${updateData.stockAnalysesDbId}`);
    console.log(`  • Stock History: ${updateData.stockHistoryDbId}`);
    console.log(`  • Sage Stocks Page: ${updateData.sageStocksPageId}`);
    console.log();

  } catch (error) {
    console.error();
    console.error('❌ Recovery failed:', error);
    console.error();

    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error();
      console.error('Stack trace:');
      console.error(error.stack);
    }

    log(LogLevel.ERROR, 'Setup recovery failed', {
      email: AFFECTED_USER_EMAIL,
      error: error instanceof Error ? error.message : String(error),
    });

    process.exit(1);
  }
}

// Run recovery
recoverSetup().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
