import librosa
import librosa.display
import json
import numpy as np
import os
import matplotlib.pyplot as plt

# --- NEW: Set the sensitivity for onset detection ---
# A higher value (e.g., 0.4) will only keep the strongest hits.
# A lower value (e.g., 0.1) will include more subtle notes.
STRENGTH_THRESHOLD = 0.15

def analyze_audio_with_strength_and_plot(audio_path, output_path_json, output_path_plot):
    """
    Analyzes an audio file for strong onsets, saves the data to JSON,
    and generates a visualization of the analysis.
    """
    print(f"Loading audio file: {audio_path}...")
    try:
        y, sr = librosa.load(audio_path)
    except Exception as e:
        print(f"Error loading audio file: {e}")
        return

    print("Detecting onsets and measuring strength...")
    
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    onset_frames = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
    onset_timestamps = librosa.frames_to_time(onset_frames, sr=sr)
    
    all_onsets = []
    for onset_time in onset_timestamps:
        frame_index = np.argmin(np.abs(librosa.times_like(onset_env, sr=sr) - onset_time))
        strength = onset_env[frame_index]
        all_onsets.append({"time": onset_time, "strength": float(strength)})

    if not all_onsets:
        print("No onsets were detected.")
        return

    # Normalize strength values (0 to 1 range)
    max_strength = max([o['strength'] for o in all_onsets], default=1)
    if max_strength > 0:
        for o in all_onsets:
            o['strength'] = (o['strength'] / max_strength)**1.5

    # --- NEW: Filter the onsets by the strength threshold ---
    print(f"Filtering onsets with a strength threshold of {STRENGTH_THRESHOLD}...")
    filtered_onsets = [o for o in all_onsets if o['strength'] >= STRENGTH_THRESHOLD]
    print(f"Kept {len(filtered_onsets)} of the original {len(all_onsets)} onsets.")

    # Create the final data structure with only the strong onsets
    output_data = {"onsets": filtered_onsets}

    print(f"Saving analysis data to: {output_path_json}...")
    with open(output_path_json, 'w') as f:
        json.dump(output_data, f, indent=2)

    # --- Generate and save the plot with the filtered data ---
    print(f"Generating plot and saving to: {output_path_plot}...")
    fig, ax = plt.subplots(figsize=(15, 5))
    times = librosa.times_like(onset_env, sr=sr)
    
    ax.plot(times, onset_env, alpha=0.5, label='Onset Strength Envelope')
    
    # Get data from the filtered list for plotting
    filtered_times = [o['time'] for o in filtered_onsets]
    filtered_strengths = [o['strength'] for o in filtered_onsets]
    ax.stem(filtered_times, filtered_strengths, 'r', markerfmt='r.', label=f'Detected Onsets (Strength >= {STRENGTH_THRESHOLD})')

    ax.set_title('Onset Detection and Strength Analysis')
    ax.set_xlabel('Time (s)')
    ax.set_ylabel('Strength')
    ax.legend()
    ax.grid(True, alpha=0.2)
    plt.tight_layout()
    plt.savefig(output_path_plot)
    print("Plot saved successfully.")
    
    print("\nAnalysis complete!")


if __name__ == '__main__':
    audio_file_name_base = 'IKYHWM'
    
    input_path = os.path.join('assets', 'audio', f"{audio_file_name_base}.mp3")
    output_path_json = os.path.join('assets', 'audio', f"{audio_file_name_base}_data.json")
    output_path_plot = os.path.join('assets', 'audio', f"{audio_file_name_base}_plot.png")
    
    analyze_audio_with_strength_and_plot(input_path, output_path_json, output_path_plot)