import type {
  OptimizationArchitectureId,
  OptimizationCategory,
  OptimizationMetricWeights,
  OptimizationParameterRange,
} from './contracts.js';

export interface OptimizationArchitectureDefinition {
  id: OptimizationArchitectureId;
  label: string;
  family: string;
  parameterRanges: OptimizationParameterRange[];
  defaultMetricWeights: OptimizationMetricWeights;
  controlIds: string[];
}

export interface OptimizationCategoryDefinition {
  id: OptimizationCategory;
  label: string;
  targetIds: readonly string[];
  architectures: OptimizationArchitectureDefinition[];
}

const PARAMETRIC_EQ_ARCHITECTURES: OptimizationArchitectureDefinition[] = [
  {
    id: 'eq_3band_musical',
    label: '3-Band Musical EQ',
    family: 'musical_tone_eq',
    controlIds: ['low', 'mid', 'high', 'presence', 'trim'],
    parameterRanges: [
      { id: 'low_gain_db', min: -12, max: 12, initial: 1.5 },
      { id: 'mid_gain_db', min: -12, max: 12, initial: 0.5 },
      { id: 'high_gain_db', min: -12, max: 12, initial: 1.25 },
      { id: 'mid_freq_hz', min: 250, max: 5000, initial: 1200 },
      { id: 'mid_q', min: 0.3, max: 2.5, initial: 0.8 },
      { id: 'trim_db', min: -6, max: 6, initial: 0 },
    ],
    defaultMetricWeights: {
      target_curve_fit: 0.35,
      band_interaction_smoothness: 0.2,
      low_end_preservation: 0.15,
      high_end_brittleness_proxy: 0.1,
      mono_compatibility: 0.1,
      gain_compensation_sanity: 0.1,
    },
  },
  {
    id: 'eq_5band_parametric',
    label: '5-Band Parametric EQ',
    family: 'clean_parametric_eq',
    controlIds: ['low', 'low_mid', 'mid', 'presence', 'air', 'trim'],
    parameterRanges: [
      { id: 'mid_band1_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'mid_band2_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'mid_band3_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'mid_band4_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'mid_band5_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'side_band1_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'side_band2_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'side_band3_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'side_band4_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'side_band5_gain_db', min: -15, max: 15, initial: 0 },
      { id: 'mid_band1_freq_hz', min: 80, max: 400, initial: 160 },
      { id: 'mid_band2_freq_hz', min: 180, max: 1000, initial: 520 },
      { id: 'mid_band3_freq_hz', min: 500, max: 2500, initial: 1400 },
      { id: 'mid_band4_freq_hz', min: 1800, max: 5500, initial: 3400 },
      { id: 'mid_band5_freq_hz', min: 4200, max: 12000, initial: 7600 },
      { id: 'side_band1_freq_hz', min: 80, max: 400, initial: 180 },
      { id: 'side_band2_freq_hz', min: 180, max: 1000, initial: 580 },
      { id: 'side_band3_freq_hz', min: 500, max: 2500, initial: 1600 },
      { id: 'side_band4_freq_hz', min: 1800, max: 5500, initial: 3800 },
      { id: 'side_band5_freq_hz', min: 4200, max: 12000, initial: 8400 },
      { id: 'mid_band1_q', min: 0.4, max: 2.0, initial: 0.8 },
      { id: 'mid_band2_q', min: 0.5, max: 3.0, initial: 1.1 },
      { id: 'mid_band3_q', min: 0.5, max: 3.5, initial: 1.3 },
      { id: 'mid_band4_q', min: 0.7, max: 4.0, initial: 1.5 },
      { id: 'mid_band5_q', min: 0.4, max: 2.5, initial: 0.9 },
      { id: 'side_band1_q', min: 0.4, max: 2.0, initial: 0.8 },
      { id: 'side_band2_q', min: 0.5, max: 3.0, initial: 1.1 },
      { id: 'side_band3_q', min: 0.5, max: 3.5, initial: 1.3 },
      { id: 'side_band4_q', min: 0.7, max: 4.0, initial: 1.5 },
      { id: 'side_band5_q', min: 0.4, max: 2.5, initial: 0.9 },
      { id: 'width_amt', min: 0, max: 1, initial: 0.68 },
      { id: 'trim_db', min: -6, max: 6, initial: 0 },
    ],
    defaultMetricWeights: {
      target_curve_fit: 0.4,
      band_interaction_smoothness: 0.2,
      resonance_harshness_proxy: 0.15,
      mono_compatibility: 0.1,
      output_stability: 0.1,
      gain_compensation_sanity: 0.05,
    },
  },
  {
    id: 'eq_tilt_presence',
    label: 'Tilt / Presence EQ',
    family: 'tilt_presence_eq',
    controlIds: ['weight', 'clarity', 'air', 'trim'],
    parameterRanges: [
      { id: 'tilt_amount_db', min: -9, max: 9, initial: 0 },
      { id: 'presence_gain_db', min: -9, max: 9, initial: 1.5 },
      { id: 'air_gain_db', min: -9, max: 9, initial: 1.0 },
      { id: 'pivot_hz', min: 400, max: 2500, initial: 1000 },
      { id: 'trim_db', min: -6, max: 6, initial: 0 },
    ],
    defaultMetricWeights: {
      target_curve_fit: 0.3,
      band_interaction_smoothness: 0.25,
      high_end_brittleness_proxy: 0.15,
      low_end_preservation: 0.15,
      gain_compensation_sanity: 0.15,
    },
  },
  {
    id: 'eq_resonant_creative',
    label: 'Resonant Creative EQ',
    family: 'resonant_texture_eq',
    controlIds: ['weight', 'color', 'resonance', 'air', 'trim'],
    parameterRanges: [
      { id: 'resonant_gain_db', min: -12, max: 12, initial: 2.5 },
      { id: 'resonant_freq_hz', min: 120, max: 8000, initial: 1800 },
      { id: 'resonant_q', min: 0.7, max: 8.0, initial: 1.4 },
      { id: 'air_gain_db', min: -9, max: 9, initial: 0.5 },
      { id: 'trim_db', min: -6, max: 6, initial: 0 },
    ],
    defaultMetricWeights: {
      target_curve_fit: 0.2,
      resonance_harshness_proxy: 0.25,
      colorfulness: 0.2,
      mono_compatibility: 0.1,
      output_stability: 0.1,
      gain_compensation_sanity: 0.15,
    },
  },
];

const SYNTH_ARCHITECTURES: OptimizationArchitectureDefinition[] = [
  {
    id: 'mono_bass',
    label: 'Mono Bass',
    family: 'mono_bass',
    controlIds: ['brightness', 'body', 'drive', 'punch', 'movement'],
    parameterRanges: [
      { id: 'cutoff_hz', min: 80, max: 4000, initial: 640 },
      { id: 'resonance', min: 0.2, max: 1.3, initial: 0.55 },
      { id: 'drive_amt', min: 0, max: 1.5, initial: 0.35 },
      { id: 'glide_time', min: 0, max: 0.5, initial: 0.08 },
      { id: 'release_s', min: 0.05, max: 1.2, initial: 0.25 },
      { id: 'vibrato_rate', min: 0.1, max: 8, initial: 0.8 },
      { id: 'vibrato_depth', min: 0, max: 0.08, initial: 0.01 },
    ],
    defaultMetricWeights: {
      target_tone_fit: 0.28,
      motion_richness: 0.12,
      transient_shape: 0.18,
      glide_behavior: 0.1,
      harmonic_character: 0.14,
      output_stability: 0.1,
      stereo_width_proxy: 0.04,
      mix_readiness: 0.04,
    },
  },
  {
    id: 'supersaw_pad',
    label: 'Supersaw Pad',
    family: 'supersaw_pad',
    controlIds: ['brightness', 'movement', 'space', 'width', 'character'],
    parameterRanges: [
      { id: 'cutoff_hz', min: 300, max: 12000, initial: 4200 },
      { id: 'detune', min: 0, max: 0.2, initial: 0.08 },
      { id: 'width_amt', min: 0, max: 1, initial: 0.7 },
      { id: 'attack_s', min: 0.01, max: 2.5, initial: 0.4 },
      { id: 'release_s', min: 0.2, max: 4.5, initial: 1.8 },
      { id: 'lfo_rate', min: 0.05, max: 3, initial: 0.35 },
      { id: 'lfo_depth', min: 0, max: 0.5, initial: 0.18 },
      { id: 'reverb_mix', min: 0, max: 0.6, initial: 0.28 },
    ],
    defaultMetricWeights: {
      target_tone_fit: 0.2,
      motion_richness: 0.18,
      transient_shape: 0.08,
      glide_behavior: 0.04,
      harmonic_character: 0.12,
      output_stability: 0.1,
      stereo_width_proxy: 0.16,
      mix_readiness: 0.12,
    },
  },
  {
    id: 'velvet_pluck',
    label: 'Velvet Pluck',
    family: 'velvet_pluck',
    controlIds: ['brightness', 'punch', 'body', 'space', 'character'],
    parameterRanges: [
      { id: 'cutoff_hz', min: 500, max: 10000, initial: 3200 },
      { id: 'decay_s', min: 0.05, max: 1.5, initial: 0.35 },
      { id: 'release_s', min: 0.05, max: 1.2, initial: 0.25 },
      { id: 'drive_amt', min: 0, max: 0.9, initial: 0.2 },
      { id: 'echo_time', min: 0.05, max: 0.6, initial: 0.22 },
      { id: 'echo_feedback', min: 0, max: 0.6, initial: 0.18 },
      { id: 'brightness_q', min: 0.2, max: 1.8, initial: 0.7 },
    ],
    defaultMetricWeights: {
      target_tone_fit: 0.24,
      motion_richness: 0.06,
      transient_shape: 0.24,
      glide_behavior: 0.02,
      harmonic_character: 0.14,
      output_stability: 0.1,
      stereo_width_proxy: 0.08,
      mix_readiness: 0.12,
    },
  },
  {
    id: 'stereo_lead',
    label: 'Stereo Lead',
    family: 'stereo_lead',
    controlIds: ['brightness', 'width', 'drive', 'movement', 'character'],
    parameterRanges: [
      { id: 'cutoff_hz', min: 200, max: 8000, initial: 2400 },
      { id: 'resonance', min: 0.2, max: 1.5, initial: 0.7 },
      { id: 'drive_amt', min: 0, max: 1.5, initial: 0.45 },
      { id: 'glide_time', min: 0, max: 0.7, initial: 0.16 },
      { id: 'width_amt', min: 0, max: 1, initial: 0.58 },
      { id: 'vibrato_rate', min: 0.1, max: 10, initial: 4.5 },
      { id: 'vibrato_depth', min: 0, max: 0.12, initial: 0.025 },
    ],
    defaultMetricWeights: {
      target_tone_fit: 0.24,
      motion_richness: 0.16,
      transient_shape: 0.1,
      glide_behavior: 0.12,
      harmonic_character: 0.14,
      output_stability: 0.1,
      stereo_width_proxy: 0.1,
      mix_readiness: 0.04,
    },
  },
];

const REVERB_SPACE_ARCHITECTURES: OptimizationArchitectureDefinition[] = [
  {
    id: 'plate_space',
    label: 'Plate Space',
    family: 'plate_space',
    controlIds: ['space', 'diffusion', 'damping', 'preDelay', 'bloom'],
    parameterRanges: [
      { id: 'space_amt', min: 0, max: 1, initial: 0.66 },
      { id: 'diffusion_amt', min: 0, max: 1, initial: 0.62 },
      { id: 'damping_amt', min: 0, max: 1, initial: 0.34 },
      { id: 'predelay_amt', min: 0, max: 1, initial: 0.18 },
      { id: 'bloom_amt', min: 0, max: 1, initial: 0.44 },
    ],
    defaultMetricWeights: {
      size_match: 0.18,
      density_profile: 0.18,
      spectral_darkness_match: 0.14,
      bloom_quality: 0.14,
      transient_preservation: 0.14,
      stereo_field: 0.12,
      modulation_coherence: 0.04,
      mix_readiness: 0.06,
    },
  },
  {
    id: 'hall_bloom',
    label: 'Hall Bloom',
    family: 'hall_bloom',
    controlIds: ['space', 'diffusion', 'damping', 'preDelay', 'bloom'],
    parameterRanges: [
      { id: 'space_amt', min: 0, max: 1, initial: 0.78 },
      { id: 'diffusion_amt', min: 0, max: 1, initial: 0.72 },
      { id: 'damping_amt', min: 0, max: 1, initial: 0.48 },
      { id: 'predelay_amt', min: 0, max: 1, initial: 0.22 },
      { id: 'bloom_amt', min: 0, max: 1, initial: 0.58 },
    ],
    defaultMetricWeights: {
      size_match: 0.22,
      density_profile: 0.18,
      spectral_darkness_match: 0.12,
      bloom_quality: 0.18,
      transient_preservation: 0.1,
      stereo_field: 0.12,
      modulation_coherence: 0.02,
      mix_readiness: 0.06,
    },
  },
  {
    id: 'modulated_echo_verb',
    label: 'Modulated Echo Verb',
    family: 'modulated_echo_verb',
    controlIds: ['space', 'feedbackTone', 'modDepth', 'modRate', 'bloom'],
    parameterRanges: [
      { id: 'space_amt', min: 0, max: 1, initial: 0.52 },
      { id: 'feedback_tone_amt', min: 0, max: 1, initial: 0.46 },
      { id: 'mod_depth_amt', min: 0, max: 1, initial: 0.34 },
      { id: 'mod_rate_amt', min: 0, max: 1, initial: 0.24 },
      { id: 'bloom_amt', min: 0, max: 1, initial: 0.42 },
    ],
    defaultMetricWeights: {
      size_match: 0.14,
      density_profile: 0.12,
      spectral_darkness_match: 0.12,
      bloom_quality: 0.14,
      transient_preservation: 0.1,
      stereo_field: 0.12,
      modulation_coherence: 0.18,
      mix_readiness: 0.08,
    },
  },
  {
    id: 'dark_motion_verb',
    label: 'Dark Motion Verb',
    family: 'dark_motion_verb',
    controlIds: ['space', 'damping', 'movement', 'modDepth', 'bloom'],
    parameterRanges: [
      { id: 'space_amt', min: 0, max: 1, initial: 0.64 },
      { id: 'damping_amt', min: 0, max: 1, initial: 0.62 },
      { id: 'movement_amt', min: 0, max: 1, initial: 0.36 },
      { id: 'mod_depth_amt', min: 0, max: 1, initial: 0.26 },
      { id: 'bloom_amt', min: 0, max: 1, initial: 0.4 },
    ],
    defaultMetricWeights: {
      size_match: 0.16,
      density_profile: 0.14,
      spectral_darkness_match: 0.2,
      bloom_quality: 0.14,
      transient_preservation: 0.08,
      stereo_field: 0.12,
      modulation_coherence: 0.12,
      mix_readiness: 0.04,
    },
  },
];

const DELAY_ECHO_ARCHITECTURES: OptimizationArchitectureDefinition[] = [
  {
    id: 'tempo_echo',
    label: 'Tempo Echo',
    family: 'tempo_echo',
    controlIds: ['space', 'movement', 'character', 'width'],
    parameterRanges: [
      { id: 'time_amt', min: 0, max: 1, initial: 0.5 },
      { id: 'feedback_amt', min: 0, max: 1, initial: 0.5 },
      { id: 'darkness_amt', min: 0, max: 1, initial: 0.4 },
      { id: 'width_amt', min: 0, max: 1, initial: 0.5 },
      { id: 'movement_amt', min: 0, max: 1, initial: 0.2 },
    ],
    defaultMetricWeights: {
      time_match: 0.2,
      feedback_contour: 0.2,
      tonal_decay_match: 0.16,
      stereo_spread: 0.12,
      modulation_coherence: 0.1,
      rhythmic_clarity: 0.14,
      diffusion_profile: 0.04,
      mix_readiness: 0.04,
    },
  },
  {
    id: 'modulated_echo_delay',
    label: 'Modulated Echo Delay',
    family: 'modulated_echo_delay',
    controlIds: ['space', 'feedbackTone', 'modDepth', 'modRate', 'bloom'],
    parameterRanges: [
      { id: 'time_amt', min: 0, max: 1, initial: 0.6 },
      { id: 'feedback_amt', min: 0, max: 1, initial: 0.56 },
      { id: 'darkness_amt', min: 0, max: 1, initial: 0.52 },
      { id: 'width_amt', min: 0, max: 1, initial: 0.55 },
      { id: 'mod_depth_amt', min: 0, max: 1, initial: 0.34 },
      { id: 'mod_rate_amt', min: 0, max: 1, initial: 0.24 },
      { id: 'diffusion_amt', min: 0, max: 1, initial: 0.42 },
    ],
    defaultMetricWeights: {
      time_match: 0.14,
      feedback_contour: 0.16,
      tonal_decay_match: 0.14,
      stereo_spread: 0.12,
      modulation_coherence: 0.18,
      rhythmic_clarity: 0.08,
      diffusion_profile: 0.12,
      mix_readiness: 0.06,
    },
  },
];

export const OPTIMIZATION_CATEGORIES: Record<OptimizationCategory, OptimizationCategoryDefinition> = {
  parametric_eq: {
    id: 'parametric_eq',
    label: 'Parametric EQ',
    targetIds: ['warmth', 'air', 'clarity', 'weight', 'forwardness', 'smoothness', 'precision', 'color', 'resonance'],
    architectures: PARAMETRIC_EQ_ARCHITECTURES,
  },
  synth: {
    id: 'synth',
    label: 'Synth',
    targetIds: ['brightness', 'body', 'movement', 'width', 'punch', 'character', 'space', 'smoothness', 'glide'],
    architectures: SYNTH_ARCHITECTURES,
  },
  reverb_space: {
    id: 'reverb_space',
    label: 'Reverb Space',
    targetIds: ['size', 'density', 'darkness', 'bloom', 'modulation', 'width', 'predelay', 'transient_preservation'],
    architectures: REVERB_SPACE_ARCHITECTURES,
  },
  delay_echo: {
    id: 'delay_echo',
    label: 'Delay Echo',
    targetIds: ['time', 'feedback', 'darkness', 'width', 'modulation', 'rhythmicity', 'diffusion', 'mix_clarity'],
    architectures: DELAY_ECHO_ARCHITECTURES,
  },
};

export function getOptimizationCategory(category: OptimizationCategory): OptimizationCategoryDefinition {
  return OPTIMIZATION_CATEGORIES[category];
}

export function getOptimizationArchitecture(category: OptimizationCategory, architectureId: OptimizationArchitectureId): OptimizationArchitectureDefinition {
  const found = getOptimizationCategory(category).architectures.find((architecture) => architecture.id === architectureId);
  if (!found) {
    throw new Error(`Unknown optimization architecture "${architectureId}" for category "${category}"`);
  }
  return found;
}
