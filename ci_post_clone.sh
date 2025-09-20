#!/bin/sh
set -euo pipefail
echo "📦 Xcode Cloud: running pod install"

# if your workspace is ios/GameVoid.xcworkspace, your iOS dir is `ios`
cd ios

# Use Bundler if you have a Gemfile; else use system cocoapods
if [ -f "../Gemfile" ] || [ -f "Gemfile" ]; then
  echo "➡️ Using Bundler"
  bundle install
  bundle exec pod install --repo-update
else
  echo "➡️ Using system CocoaPods"
  pod install --repo-update
fi

echo "✅ Pods installed"
//
//  ci_post_clone.sh
//  
//
//  Created by Andrew Blewett on 20/09/2025.
//

