const { spawn } = require('child_process');
const os = require('os');
const readline = require('readline');

class CrossPlatformStreamer {
    constructor() {
        this.ffmpegProcess = null;
        this.isStreaming = false;
        this.platform = os.platform();
        
        if (this.platform !== 'darwin' && this.platform !== 'linux') {
            throw new Error('This streamer only supports macOS and Linux');
        }
    }

    // List available devices/windows
    async listDevices() {
        console.log('Checking available capture sources...');
        
        if (this.platform === 'darwin') {
            await this.listMacOSDevices();
            await this.listMacOSWindows();
        } else {
            await this.listLinuxDevices();
            await this.listLinuxWindows();
        }
    }

    async listMacOSDevices() {
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', '""']);
            let output = '';
            
            ffmpeg.stderr.on('data', (data) => {
                output += data.toString();
            });
            
            ffmpeg.on('close', () => {
                console.log('Available AVFoundation devices:');
                console.log(output);
                
                // Parse and display devices in a cleaner format
                this.parseAndDisplayDevices(output);
                resolve(output);
            });
        });
    }

    parseAndDisplayDevices(output) {
        const lines = output.split('\n');
        let inVideoSection = false;
        let inAudioSection = false;
        
        console.log('\n' + '='.repeat(60));
        console.log('PARSED DEVICE INFORMATION:');
        console.log('='.repeat(60));
        console.log('\n📹 VIDEO DEVICES (for screen/window capture):');
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            
            if (line.includes('AVFoundation video devices:')) {
                inVideoSection = true;
                inAudioSection = false;
                continue;
            }
            
            if (line.includes('AVFoundation audio devices:')) {
                inVideoSection = false;
                inAudioSection = true;
                console.log('\n🎤 AUDIO DEVICES:');
                continue;
            }
            
            if (inVideoSection && line.includes('[')) {
                const match = line.match(/\[(\d+)\]\s*(.+)/);
                if (match) {
                    const deviceNum = match[1];
                    const deviceName = match[2].trim();
                    console.log(`  ${deviceNum}: ${deviceName}`);
                    
                    // Add hints for common devices
                    if (deviceName.toLowerCase().includes('screen') || 
                        deviceName.toLowerCase().includes('display') ||
                        deviceName.toLowerCase().includes('capture')) {
                        console.log(`      ↳ Use this for screen/window capture`);
                    }
                }
            }
            
            if (inAudioSection && line.includes('[')) {
                const match = line.match(/\[(\d+)\]\s*(.+)/);
                if (match) {
                    const deviceNum = match[1];
                    const deviceName = match[2].trim();
                    console.log(`  ${deviceNum}: ${deviceName}`);
                    
                    // Add hints for common devices
                    if (deviceName.toLowerCase().includes('built-in') || 
                        deviceName.toLowerCase().includes('microphone')) {
                        console.log(`      ↳ Built-in microphone`);
                    } else if (deviceName.toLowerCase().includes('blackhole') || 
                               deviceName.toLowerCase().includes('soundflower')) {
                        console.log(`      ↳ System audio capture`);
                    }
                }
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('USAGE INSTRUCTIONS:');
        console.log('='.repeat(60));
        console.log('📹 Video Device: Enter the number for screen capture (usually 1 or 2)');
        console.log('🎤 Audio Device: Enter the number for your preferred audio input');
        console.log('   • 0 = Built-in microphone (your voice)');
        console.log('   • Higher numbers = System audio/other inputs');
        console.log('💡 For system audio, install BlackHole: brew install blackhole-2ch');
        console.log('='.repeat(60));
    }

    async listMacOSWindows() {
        console.log('\nAvailable windows (for window capture):');
        return new Promise((resolve) => {
            const osascript = spawn('osascript', [
                '-e',
                'tell application "System Events" to get name of (processes where background only is false)'
            ]);
            let output = '';
            
            osascript.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            osascript.on('close', (code) => {
                if (code === 0) {
                    console.log('Running applications:', output.replace(/,/g, '\n'));
                }
                resolve(output);
            });
            
            osascript.on('error', () => {
                console.log('Could not list windows');
                resolve('');
            });
        });
    }

    async listLinuxDevices() {
        console.log('Linux screen capture will use X11 display :0.0');
        console.log('Available audio devices:');
        
        return new Promise((resolve) => {
            // List PulseAudio sources
            const pactl = spawn('pactl', ['list', 'sources', 'short']);
            let output = '';
            
            pactl.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            pactl.on('close', (code) => {
                if (code === 0) {
                    console.log('PulseAudio sources:');
                    console.log(output);
                } else {
                    console.log('Could not list PulseAudio sources. Default will be used.');
                }
                resolve(output);
            });
            
            pactl.on('error', () => {
                console.log('PulseAudio not available. Will try ALSA.');
                resolve('');
            });
        });
    }

    async listLinuxWindows() {
        console.log('\nAvailable windows (for window capture):');
        return new Promise((resolve) => {
            const wmctrl = spawn('wmctrl', ['-l']);
            let output = '';
            
            wmctrl.stdout.on('data', (data) => {
                output += data.toString();
            });
            
            wmctrl.on('close', (code) => {
                if (code === 0) {
                    console.log('Open windows:');
                    console.log(output);
                } else {
                    console.log('wmctrl not available. Install with: sudo apt install wmctrl');
                }
                resolve(output);
            });
            
            wmctrl.on('error', () => {
                console.log('wmctrl not available for window listing');
                resolve('');
            });
        });
    }

    // Start streaming with platform-specific configuration
    startStream(rtmpUrl, options = {}) {
        const {
            includeAudio = true,
            quality = 'medium',
            fps = 30,
            resolution = '1280x720',
            videoBitrate = '2500k',
            audioBitrate = '128k',
            audioDevice = null,
            videoDevice = null,
            windowTitle = null,
            captureMode = 'screen' // 'screen' or 'window'
        } = options;

        if (this.isStreaming) {
            throw new Error('Already streaming');
        }

        let ffmpegArgs;
        
        if (this.platform === 'darwin') {
            ffmpegArgs = this.buildMacOSArgs(rtmpUrl, {
                includeAudio,
                quality,
                fps,
                resolution,
                videoBitrate,
                audioBitrate,
                audioDevice: audioDevice || '0',
                videoDevice: videoDevice || '1',
                windowTitle,
                captureMode
            });
        } else {
            ffmpegArgs = this.buildLinuxArgs(rtmpUrl, {
                includeAudio,
                quality,
                fps,
                resolution,
                videoBitrate,
                audioBitrate,
                audioDevice: audioDevice || 'default',
                windowTitle,
                captureMode
            });
        }

        console.log('Starting FFmpeg with args:', ffmpegArgs.join(' '));

        this.ffmpegProcess = spawn('ffmpeg', ffmpegArgs);

        this.ffmpegProcess.stdout.on('data', (data) => {
            console.log(`FFmpeg stdout: ${data}`);
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
            console.log(`FFmpeg stderr: ${data}`);
        });

        this.ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            this.isStreaming = false;
        });

        this.ffmpegProcess.on('error', (error) => {
            console.error('FFmpeg error:', error);
            this.isStreaming = false;
        });

        this.isStreaming = true;
        console.log('Streaming started successfully');
    }

    buildMacOSArgs(rtmpUrl, options) {
        const { includeAudio, quality, fps, resolution, videoBitrate, audioBitrate, audioDevice, videoDevice, windowTitle, captureMode } = options;
        
        // macOS typically supports 15-30 fps for screen capture, cap at 30
        const safeFps = Math.min(fps, 30);
        
        let args = [];

        if (captureMode === 'window' && windowTitle) {
            // Window capture mode - for macOS we need to use screen capture and focus the window
            console.log(`\n🎯 Attempting to capture window: "${windowTitle}"`);
            console.log('💡 Make sure the target window is visible and not minimized');
            
            // Use screen capture but try to focus on a specific application
            args.push(
                '-f', 'avfoundation',
                '-framerate', safeFps.toString(),
                '-video_size', resolution,
                '-pixel_format', 'uyvy422',
                '-capture_cursor', '1',
                '-capture_mouse_clicks', '1',
                '-i', videoDevice // Use screen capture device
            );
            
            console.log('ℹ️  Note: macOS captures the entire screen. Position your target window prominently.');
        } else {
            // Full screen capture mode
            console.log('🖥️  Capturing entire screen');
            args.push(
                '-f', 'avfoundation',
                '-framerate', safeFps.toString(),
                '-video_size', resolution,
                '-pixel_format', 'uyvy422',
                '-capture_cursor', '1',
                '-capture_mouse_clicks', '1',
                '-i', videoDevice
            );
        }

        if (includeAudio) {
            // Add audio capture
            args.push(
                '-f', 'avfoundation',
                '-i', `:${audioDevice}`
            );
        }

        // Video encoding
        args.push(
            '-c:v', 'libx264',
            '-preset', this.getPresetFromQuality(quality),
            '-b:v', videoBitrate,
            '-maxrate', videoBitrate,
            '-bufsize', (parseInt(videoBitrate) * 2).toString() + 'k',
            '-pix_fmt', 'yuv420p',
            '-r', safeFps.toString()
        );

        if (includeAudio) {
            // Audio encoding with channel mixing
            args.push(
                '-c:a', 'aac',
                '-b:a', audioBitrate,
                '-ar', '44100',
                '-ac', '2',
                '-af', 'pan=stereo|FL=0.5*FC+0.707*FL+0.707*BL+0.5*LFE|FR=0.5*FC+0.707*FR+0.707*BR+0.5*LFE'
            );
        } else {
            args.push('-an');
        }

        // Sync and output - use fps_mode instead of deprecated vsync
        args.push(
            '-fps_mode', 'cfr',
            '-async', '1',
            '-strict', 'experimental',
            '-f', 'flv',
            rtmpUrl
        );

        return args;
    }

    buildLinuxArgs(rtmpUrl, options) {
        const { includeAudio, quality, fps, resolution, videoBitrate, audioBitrate, audioDevice } = options;
        
        let args = [
            // Screen capture
            '-f', 'x11grab',
            '-framerate', fps.toString(),
            '-video_size', resolution,
            '-i', ':0.0'
        ];

        if (includeAudio) {
            // Add audio capture - try PulseAudio first, fallback to ALSA
            args.push(
                '-f', 'pulse',
                '-i', audioDevice
            );
        }

        // Video encoding
        args.push(
            '-c:v', 'libx264',
            '-preset', this.getPresetFromQuality(quality),
            '-b:v', videoBitrate,
            '-maxrate', videoBitrate,
            '-bufsize', (parseInt(videoBitrate) * 2).toString() + 'k',
            '-pix_fmt', 'yuv420p',
            '-r', fps.toString()
        );

        if (includeAudio) {
            // Audio encoding
            args.push(
                '-c:a', 'aac',
                '-b:a', audioBitrate,
                '-ar', '44100',
                '-ac', '2'
            );
        } else {
            args.push('-an');
        }

        // Output
        args.push(
            '-f', 'flv',
            rtmpUrl
        );

        return args;
    }

    // Alternative method for Linux with ALSA fallback
    startStreamWithALSA(rtmpUrl, options = {}) {
        if (this.platform !== 'linux') {
            throw new Error('ALSA fallback is only for Linux');
        }

        const modifiedOptions = { ...options };
        const args = this.buildLinuxArgs(rtmpUrl, modifiedOptions);
        
        // Replace pulse with alsa
        const pulseIndex = args.indexOf('pulse');
        if (pulseIndex !== -1) {
            args[pulseIndex] = 'alsa';
            // Replace device name
            const deviceIndex = pulseIndex + 2;
            if (args[deviceIndex] === 'default') {
                args[deviceIndex] = 'hw:0';
            }
        }

        console.log('Starting FFmpeg with ALSA fallback:', args.join(' '));

        this.ffmpegProcess = spawn('ffmpeg', args);

        this.ffmpegProcess.stdout.on('data', (data) => {
            console.log(`FFmpeg stdout: ${data}`);
        });

        this.ffmpegProcess.stderr.on('data', (data) => {
            console.log(`FFmpeg stderr: ${data}`);
        });

        this.ffmpegProcess.on('close', (code) => {
            console.log(`FFmpeg process exited with code ${code}`);
            this.isStreaming = false;
        });

        this.ffmpegProcess.on('error', (error) => {
            console.error('FFmpeg error:', error);
            this.isStreaming = false;
        });

        this.isStreaming = true;
        console.log('Streaming started with ALSA');
    }

    getPresetFromQuality(quality) {
        const presets = {
            'fast': 'ultrafast',
            'medium': 'medium',
            'slow': 'slow',
            'high': 'veryslow'
        };
        return presets[quality] || 'medium';
    }

    stopStream() {
        if (this.ffmpegProcess && this.isStreaming) {
            this.ffmpegProcess.kill('SIGINT');
            this.isStreaming = false;
            console.log('Streaming stopped');
        }
    }

    static async checkFFmpeg() {
        return new Promise((resolve) => {
            const ffmpeg = spawn('ffmpeg', ['-version']);
            
            ffmpeg.on('close', (code) => {
                resolve(code === 0);
            });
            
            ffmpeg.on('error', () => {
                resolve(false);
            });
        });
    }

    static async checkDependencies() {
        const platform = os.platform();
        
        if (platform === 'darwin') {
            console.log('macOS detected - AVFoundation will be used');
            return true;
        } else if (platform === 'linux') {
            console.log('Linux detected - checking dependencies...');
            
            // Check for X11
            const xDisplays = process.env.DISPLAY;
            if (!xDisplays) {
                console.warn('No DISPLAY environment variable found. Make sure X11 is running.');
                return false;
            }
            
            return true;
        }
        
        return false;
    }
}

// Interactive CLI
async function main() {
    console.log('Cross-Platform YouTube RTMP Streamer');
    console.log('====================================');
    console.log(`Platform: ${os.platform()}`);

    const streamer = new CrossPlatformStreamer();
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    // Check dependencies
    const depsOk = await CrossPlatformStreamer.checkDependencies();
    if (!depsOk) {
        console.error('Dependencies check failed');
        process.exit(1);
    }

    // Check FFmpeg
    const ffmpegAvailable = await CrossPlatformStreamer.checkFFmpeg();
    if (!ffmpegAvailable) {
        console.error('FFmpeg is not installed or not in PATH');
        if (os.platform() === 'darwin') {
            console.error('Install with: brew install ffmpeg');
        } else {
            console.error('Install with: sudo apt update && sudo apt install ffmpeg');
        }
        process.exit(1);
    }

    console.log('FFmpeg is available ✓');

    // List devices
    await streamer.listDevices();

    // Get configuration
    const rtmpUrl = await askQuestion(rl, '\nEnter YouTube RTMP URL: ');
    // const captureMode = await askQuestion(rl, 'Capture mode (screen/window) [screen]: ') || 'screen';
    
    // let windowTitle = null;
    // if (captureMode === 'window') {
    //     windowTitle = await askQuestion(rl, 'Enter window title or application name: ');
    // }
    
    // const includeAudio = (await askQuestion(rl, 'Include audio? (y/n) [y]: ') || 'y').toLowerCase() === 'y';
    // const quality = await askQuestion(rl, 'Quality (fast/medium/slow/high) [medium]: ') || 'medium';
    // const resolution = await askQuestion(rl, 'Resolution (1280x720/1920x1080/1600x900) [1280x720]: ') || '1280x720';
    // const fps = parseInt(await askQuestion(rl, 'FPS [30]: ') || '30');


    const captureMode = "window"
    const includeAudio = true
    const windowTitle = "Electron"
    const quality = "medium"
    const resolution = "1920x1080"
    const fps = "60"

    // Platform-specific options
    let videoDevice = null;
    let audioDevice = null;
    
    if (os.platform() === 'darwin') {
        videoDevice = await askQuestion(rl, 'Video device (screen capture) [1]: ') || '1';
        if (includeAudio) {
            audioDevice = await askQuestion(rl, 'Audio device [0]: ') || '0';
        }
    } else {
        if (includeAudio) {
            audioDevice = await askQuestion(rl, 'Audio device [default]: ') || 'default';
        }
    }

    console.log('\nStarting stream...');
    console.log('Press Ctrl+C to stop');

    try {
        streamer.startStream(rtmpUrl, {
            includeAudio,
            quality,
            fps,
            resolution,
            videoDevice,
            audioDevice,
            windowTitle,
            captureMode
        });

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nStopping stream...');
            streamer.stopStream();
            rl.close();
            process.exit(0);
        });

    } catch (error) {
        console.error('Error starting stream:', error.message);
        
        // Try ALSA fallback on Linux
        if (os.platform() === 'linux' && includeAudio) {
            console.log('Trying ALSA fallback...');
            try {
                streamer.startStreamWithALSA(rtmpUrl, {
                    includeAudio,
                    quality,
                    fps,
                    resolution,
                    audioDevice: 'hw:0',
                    windowTitle,
                    captureMode
                });
            } catch (alsaError) {
                console.error('ALSA fallback also failed:', alsaError.message);
                rl.close();
                process.exit(1);
            }
        } else {
            rl.close();
            process.exit(1);
        }
    }
}

function askQuestion(rl, question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
}

// Export for use as module
module.exports = CrossPlatformStreamer;

// Run CLI if executed directly
if (require.main === module) {
    main().catch(console.error);
}