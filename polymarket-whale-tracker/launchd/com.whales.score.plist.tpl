<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.whales.score</string>

    <key>ProgramArguments</key>
    <array>
        <string>__PROJECT_DIR__/scripts/score_tick.sh</string>
    </array>

    <key>StartInterval</key>
    <integer>21600</integer>

    <key>RunAtLoad</key>
    <false/>

    <key>WorkingDirectory</key>
    <string>__PROJECT_DIR__</string>

    <key>StandardOutPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.score.out</string>

    <key>StandardErrorPath</key>
    <string>__PROJECT_DIR__/data/logs/launchd.score.err</string>

    <key>ProcessType</key>
    <string>Background</string>

    <key>LowPriorityIO</key>
    <true/>

    <key>Nice</key>
    <integer>5</integer>
</dict>
</plist>
