#include <cmath>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

#include <libcmaes/cmaes.h>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

namespace {

struct ParameterRange {
  std::string id;
  double min = 0.0;
  double max = 1.0;
  double initial = 0.5;
};

struct TargetVector {
  std::string category;
  std::string family;
  std::unordered_map<std::string, double> values;
};

struct JobInput {
  std::string category;
  std::string architecture_id;
  std::vector<ParameterRange> parameter_ranges;
  TargetVector target;
  std::unordered_map<std::string, double> metric_weights;
  std::vector<std::string> corpus_ids;
  std::uint32_t seed = 0;
  int max_evaluations = 64;
};

double clamp01(double value) {
  if (!std::isfinite(value)) {
    return 0.0;
  }
  if (value < 0.0) return 0.0;
  if (value > 1.0) return 1.0;
  return value;
}

double normalized_distance(double a, double b) {
  return clamp01(1.0 - std::abs(a - b));
}

double average(const std::vector<double>& values) {
  if (values.empty()) {
    return 0.0;
  }
  double sum = 0.0;
  for (double value : values) {
    sum += value;
  }
  return sum / static_cast<double>(values.size());
}

double get_value(const std::unordered_map<std::string, double>& values, const std::string& key, double fallback = 0.5) {
  const auto found = values.find(key);
  return found == values.end() ? fallback : found->second;
}

double get_param(const std::unordered_map<std::string, double>& values, const std::string& key, double fallback = 0.0) {
  const auto found = values.find(key);
  return found == values.end() ? fallback : found->second;
}

std::unordered_map<std::string, double> vector_to_params(
  const double* x,
  int dimension,
  const std::vector<ParameterRange>& ranges
) {
  std::unordered_map<std::string, double> params;
  for (int i = 0; i < dimension; ++i) {
    params.emplace(ranges[static_cast<std::size_t>(i)].id, x[i]);
  }
  return params;
}

double heuristic_peak_db(const std::unordered_map<std::string, double>& params) {
  const double gain_sum =
    std::abs(get_param(params, "low_gain_db")) +
    std::abs(get_param(params, "mid_gain_db")) +
    std::abs(get_param(params, "high_gain_db")) +
    std::abs(get_param(params, "band1_gain_db")) +
    std::abs(get_param(params, "band2_gain_db")) +
    std::abs(get_param(params, "band3_gain_db")) +
    std::abs(get_param(params, "band4_gain_db")) +
    std::abs(get_param(params, "band5_gain_db")) +
    std::abs(get_param(params, "tilt_amount_db")) +
    std::abs(get_param(params, "presence_gain_db")) +
    std::abs(get_param(params, "air_gain_db")) +
    std::abs(get_param(params, "resonant_gain_db"));

  const double trim = get_param(params, "trim_db");
  return std::max(-18.0, std::min(-0.25, -8.0 + (gain_sum * 0.08) + (trim * 0.45)));
}

double heuristic_stereo_correlation(const std::string& architecture_id) {
  if (architecture_id == "eq_resonant_creative") {
    return 0.94;
  }
  if (architecture_id == "eq_tilt_presence") {
    return 0.985;
  }
  return 0.99;
}

double synth_stereo_correlation(const std::string& architecture_id, const std::unordered_map<std::string, double>& params) {
  if (architecture_id == "mono_bass") {
    return 0.98;
  }
  const double width = get_param(params, "width_amt", get_param(params, "detune", 0.3));
  return std::max(0.15, std::min(0.95, 0.88 - width * 0.5));
}

std::unordered_map<std::string, double> compute_eq_metrics(
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target
) {
  const double low_shape = clamp01((get_param(params, "low_gain_db") + 12.0) / 24.0);
  const double mid_shape = clamp01((get_param(params, "mid_gain_db") + 12.0) / 24.0);
  const double high_shape = clamp01((get_param(params, "high_gain_db") + 12.0) / 24.0);
  const double air_shape = clamp01((get_param(params, "air_gain_db", get_param(params, "high_gain_db")) + 9.0) / 18.0);
  const double trim_shape = clamp01(1.0 - std::abs(get_param(params, "trim_db")) / 6.0);
  const double q_bias = clamp01(get_param(params, "global_q_bias", get_param(params, "resonant_q", get_param(params, "mid_q", 1.0))) / 4.0);
  const double stereo_correlation = heuristic_stereo_correlation(architecture_id);
  const double peak_db = heuristic_peak_db(params);

  const double target_weight = get_value(target.values, "weight");
  const double target_warmth = get_value(target.values, "warmth");
  const double target_clarity = get_value(target.values, "clarity");
  const double target_color = get_value(target.values, "color");
  const double target_air = get_value(target.values, "air");
  const double target_forwardness = get_value(target.values, "forwardness");
  const double target_resonance = get_value(target.values, "resonance");
  const double target_smoothness = get_value(target.values, "smoothness");

  std::unordered_map<std::string, double> metrics;
  metrics.emplace("target_curve_fit", average({
    normalized_distance(low_shape, target_weight * 0.7 + target_warmth * 0.3),
    normalized_distance(mid_shape, target_clarity * 0.55 + target_color * 0.2),
    normalized_distance(high_shape, target_air * 0.7 + target_forwardness * 0.2),
  }));
  metrics.emplace("band_interaction_smoothness", clamp01(1.0 - std::abs(low_shape - mid_shape) * 0.45 - std::abs(mid_shape - high_shape) * 0.45));
  metrics.emplace("resonance_harshness_proxy", clamp01(1.0 - std::max(0.0, q_bias - (target_resonance * 0.9 + target_color * 0.2))));
  metrics.emplace("low_end_preservation", normalized_distance(low_shape, target_weight));
  metrics.emplace("high_end_brittleness_proxy", clamp01(1.0 - std::max(0.0, air_shape - (target_air * 0.85 + target_smoothness * 0.25))));
  metrics.emplace("mono_compatibility", clamp01(1.0 - std::abs(stereo_correlation - 0.98) * 0.08));
  metrics.emplace("output_stability", clamp01(1.0 - std::abs(peak_db + 6.0) / 12.0));
  metrics.emplace("gain_compensation_sanity", trim_shape);
  metrics.emplace("colorfulness", normalized_distance(clamp01(get_param(params, "colorDrive", 0.02) / 0.2), target_color));
  return metrics;
}

std::unordered_map<std::string, double> compute_synth_metrics(
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target
) {
  const double brightness_shape = clamp01((get_param(params, "cutoff_hz", 2000.0) - 80.0) / (12000.0 - 80.0));
  const double body_shape = clamp01((1.0 - brightness_shape * 0.5) + get_param(params, "drive_amt", 0.0) * 0.15);
  const double movement_shape = clamp01((get_param(params, "vibrato_depth", get_param(params, "lfo_depth", 0.0)) * 8.0) + (get_param(params, "vibrato_rate", get_param(params, "lfo_rate", 0.3)) / 10.0) * 0.25);
  const double width_shape = clamp01(get_param(params, "width_amt", get_param(params, "detune", 0.0)) * 1.1);
  const double punch_shape = clamp01(1.0 - (get_param(params, "attack_s", get_param(params, "decay_s", 0.1)) / 2.5) * 0.7 + get_param(params, "drive_amt", 0.0) * 0.15);
  const double character_shape = clamp01(get_param(params, "drive_amt", get_param(params, "detune", 0.0)) * 0.7 + get_param(params, "resonance", get_param(params, "brightness_q", 0.4)) * 0.25);
  const double glide_shape = clamp01(get_param(params, "glide_time", 0.0) / 0.7);
  const double peak_db = std::max(-18.0, std::min(-0.2, -8.0 + get_param(params, "drive_amt", 0.0) * 2.2 + width_shape * 0.4));
  const double rms = std::max(-24.0, std::min(-9.0, -18.0 + body_shape * 4.0 + punch_shape * 1.5));
  const double stereo_correlation = synth_stereo_correlation(architecture_id, params);

  std::unordered_map<std::string, double> metrics;
  metrics.emplace("target_tone_fit", average({
    normalized_distance(brightness_shape, get_value(target.values, "brightness")),
    normalized_distance(body_shape, get_value(target.values, "body")),
    normalized_distance(character_shape, get_value(target.values, "character")),
  }));
  metrics.emplace("motion_richness", average({
    normalized_distance(movement_shape, get_value(target.values, "movement")),
    normalized_distance(width_shape, get_value(target.values, "width") * 0.8 + get_value(target.values, "space") * 0.2),
  }));
  metrics.emplace("transient_shape", average({
    normalized_distance(punch_shape, get_value(target.values, "punch")),
    normalized_distance(clamp01(get_param(params, "release_s", 0.3) / 4.5), get_value(target.values, "space") * 0.5 + get_value(target.values, "smoothness") * 0.5),
  }));
  metrics.emplace("glide_behavior", normalized_distance(glide_shape, get_value(target.values, "glide")));
  metrics.emplace("harmonic_character", average({
    normalized_distance(character_shape, get_value(target.values, "character")),
    normalized_distance(body_shape, get_value(target.values, "smoothness") * 0.35 + get_value(target.values, "body") * 0.65),
  }));
  metrics.emplace("output_stability", clamp01(1.0 - std::abs(peak_db + 6.0) / 12.0));
  metrics.emplace("stereo_width_proxy", normalized_distance(width_shape, get_value(target.values, "width")));
  metrics.emplace("mix_readiness", average({
    clamp01(1.0 - std::abs(rms + 18.0) / 10.0),
    clamp01(1.0 - std::abs(stereo_correlation - (get_value(target.values, "width") > 0.6 ? 0.45 : 0.75)) * 0.7),
  }));
  return metrics;
}

std::unordered_map<std::string, double> compute_reverb_metrics(
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target
) {
  const double size_shape = clamp01(get_param(params, "space_amt", 0.5));
  const double density_shape = clamp01(get_param(params, "diffusion_amt", 0.5) * 0.7 + get_param(params, "bloom_amt", 0.5) * 0.3);
  const double darkness_shape = clamp01(get_param(params, "damping_amt", get_param(params, "feedback_tone_amt", 0.45)) * 0.85);
  const double bloom_shape = clamp01(get_param(params, "bloom_amt", 0.5));
  const double modulation_shape = clamp01(get_param(params, "mod_depth_amt", 0.0) * 0.7 + get_param(params, "mod_rate_amt", get_param(params, "movement_amt", 0.0)) * 0.3);
  const double predelay_shape = clamp01(get_param(params, "predelay_amt", 0.2));
  const double width_target = get_value(target.values, "width") > 0.65 ? 0.3 : 0.55;
  const double stereo_correlation = std::max(-0.08, std::min(0.92, 0.72 - get_value(target.values, "width") * 0.32 - modulation_shape * 0.08));
  const double measured_width = clamp01(1.0 - std::abs(stereo_correlation - width_target) / 0.7);
  const double decay_shape = clamp01((420.0 + size_shape * 3200.0 + bloom_shape * 900.0 + modulation_shape * 180.0 - predelay_shape * 120.0 - darkness_shape * 80.0 - (architecture_id == "plate_space" ? 220.0 : 0.0)) / 5000.0);
  const double measured_darkness = clamp01(darkness_shape * 0.8 + (architecture_id == "dark_motion_verb" ? 0.12 : 0.0));
  const double peak_db = std::max(-18.0, std::min(-0.35, -9.0 + bloom_shape * 1.4 + density_shape * 0.6));
  const double rms = std::max(-25.0, std::min(-14.0, -22.0 + bloom_shape * 3.2 + size_shape * 2.0));

  std::unordered_map<std::string, double> metrics;
  metrics.emplace("size_match", average({
    normalized_distance(size_shape, get_value(target.values, "size")),
    normalized_distance(decay_shape, get_value(target.values, "size")),
    normalized_distance(predelay_shape, get_value(target.values, "predelay") * 0.65 + get_value(target.values, "transient_preservation") * 0.35),
  }));
  metrics.emplace("density_profile", average({
    normalized_distance(density_shape, get_value(target.values, "density")),
    normalized_distance(clamp01((density_shape * 0.65) + (bloom_shape * 0.35)), get_value(target.values, "density")),
  }));
  metrics.emplace("spectral_darkness_match", average({
    normalized_distance(darkness_shape, get_value(target.values, "darkness")),
    normalized_distance(measured_darkness, get_value(target.values, "darkness")),
  }));
  metrics.emplace("bloom_quality", average({
    normalized_distance(bloom_shape, get_value(target.values, "bloom")),
    normalized_distance(decay_shape, get_value(target.values, "bloom") * 0.7 + get_value(target.values, "size") * 0.3),
  }));
  metrics.emplace("transient_preservation", average({
    normalized_distance(predelay_shape, get_value(target.values, "transient_preservation") * 0.7 + get_value(target.values, "predelay") * 0.3),
    clamp01(1.0 - std::abs(decay_shape - (get_value(target.values, "transient_preservation") > 0.65 ? 0.3 : 0.55)) * 1.4),
  }));
  metrics.emplace("stereo_field", average({
    measured_width,
    normalized_distance(clamp01(1.0 - stereo_correlation), get_value(target.values, "width")),
  }));
  metrics.emplace("modulation_coherence", normalized_distance(modulation_shape, get_value(target.values, "modulation")));
  metrics.emplace("mix_readiness", average({
    clamp01(1.0 - std::abs(peak_db + 8.0) / 10.0),
    clamp01(1.0 - std::abs(rms + 21.0) / 9.0),
    clamp01(1.0 - bloom_shape * 0.35),
  }));
  return metrics;
}

std::unordered_map<std::string, double> compute_delay_metrics(
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target
) {
  const double time_shape = clamp01(get_param(params, "time_amt", 0.5));
  const double feedback_shape = clamp01(get_param(params, "feedback_amt", 0.5));
  const double darkness_shape = clamp01(get_param(params, "darkness_amt", 0.4));
  const double width_shape = clamp01(get_param(params, "width_amt", 0.5));
  const double modulation_shape = clamp01(get_param(params, "movement_amt", 0.0) * 0.6 + get_param(params, "mod_depth_amt", 0.0) * 0.3 + get_param(params, "mod_rate_amt", 0.0) * 0.1);
  const double diffusion_shape = clamp01(get_param(params, "diffusion_amt", 0.3));
  const double stereo_correlation = std::max(0.12, std::min(0.96, 0.82 - width_shape * 0.38 - modulation_shape * 0.08));
  const double measured_width = clamp01(1.0 - std::abs(stereo_correlation - (get_value(target.values, "width") > 0.6 ? 0.38 : 0.66)) / 0.7);
  const double measured_decay = clamp01((160.0 + time_shape * 900.0 + feedback_shape * 1100.0 + diffusion_shape * 240.0 + modulation_shape * 140.0) / 2600.0);
  const double measured_darkness = clamp01(darkness_shape * 0.82 + (architecture_id == "modulated_echo_delay" ? 0.08 : 0.0));
  const double peak_db = std::max(-18.0, std::min(-0.35, -9.0 + feedback_shape * 1.4 + modulation_shape * 0.5));
  const double rms = std::max(-25.0, std::min(-14.0, -21.0 + feedback_shape * 2.4 + diffusion_shape * 1.4));

  std::unordered_map<std::string, double> metrics;
  metrics.emplace("time_match", average({
    normalized_distance(time_shape, get_value(target.values, "time")),
    normalized_distance(measured_decay, get_value(target.values, "time") * 0.65 + get_value(target.values, "feedback") * 0.35),
  }));
  metrics.emplace("feedback_contour", average({
    normalized_distance(feedback_shape, get_value(target.values, "feedback")),
    normalized_distance(measured_decay, get_value(target.values, "feedback") * 0.7 + get_value(target.values, "diffusion") * 0.3),
  }));
  metrics.emplace("tonal_decay_match", average({
    normalized_distance(darkness_shape, get_value(target.values, "darkness")),
    normalized_distance(measured_darkness, get_value(target.values, "darkness")),
  }));
  metrics.emplace("stereo_spread", average({
    normalized_distance(width_shape, get_value(target.values, "width")),
    measured_width,
  }));
  metrics.emplace("modulation_coherence", normalized_distance(modulation_shape, get_value(target.values, "modulation")));
  metrics.emplace("rhythmic_clarity", average({
    normalized_distance(clamp01(1.0 - diffusion_shape * 0.7), get_value(target.values, "rhythmicity")),
    normalized_distance(clamp01(1.0 - modulation_shape * 0.45), get_value(target.values, "rhythmicity")),
  }));
  metrics.emplace("diffusion_profile", average({
    normalized_distance(diffusion_shape, get_value(target.values, "diffusion")),
    normalized_distance(clamp01(feedback_shape * 0.55 + modulation_shape * 0.2), get_value(target.values, "diffusion")),
  }));
  metrics.emplace("mix_readiness", average({
    clamp01(1.0 - std::abs(peak_db + 8.5) / 10.0),
    clamp01(1.0 - std::abs(rms + 20.5) / 9.0),
    clamp01(1.0 - feedback_shape * 0.25 - diffusion_shape * 0.15),
  }));
  return metrics;
}

std::unordered_map<std::string, double> compute_metrics(
  const std::string& category,
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target
) {
  if (category == "delay_echo") {
    return compute_delay_metrics(architecture_id, params, target);
  }
  if (category == "reverb_space") {
    return compute_reverb_metrics(architecture_id, params, target);
  }
  if (category == "synth") {
    return compute_synth_metrics(architecture_id, params, target);
  }
  return compute_eq_metrics(architecture_id, params, target);
}

json score_candidate(
  const std::string& architecture_id,
  const std::unordered_map<std::string, double>& params,
  const TargetVector& target,
  const std::unordered_map<std::string, double>& metric_weights
) {
  const auto raw_metrics = compute_metrics(target.category, architecture_id, params, target);
  json metrics = json::array();
  double weighted_total = 0.0;
  double weight_total = 0.0;

  for (const auto& [metric_id, weight] : metric_weights) {
    const auto found = raw_metrics.find(metric_id);
    const double value = clamp01(found == raw_metrics.end() ? 0.0 : found->second);
    const double weighted_score = value * weight;
    weighted_total += weighted_score;
    weight_total += weight;
    metrics.push_back({
      {"metricId", metric_id},
      {"value", value},
      {"weight", weight},
      {"weightedScore", weighted_score},
    });
  }

  const double normalized_score = weight_total > 0.0 ? (weighted_total / weight_total) : 0.0;
  return {
    {"score", normalized_score},
    {"metrics", metrics},
  };
}

JobInput parse_input(std::istream& input_stream) {
  const json payload = json::parse(input_stream);
  JobInput job;
  job.category = payload.at("category").get<std::string>();
  job.architecture_id = payload.at("architectureId").get<std::string>();
  job.seed = payload.value("seed", 0u);
  job.max_evaluations = payload.value("maxEvaluations", 64);
  job.corpus_ids = payload.value("corpusIds", std::vector<std::string>{});

  for (const json& range_json : payload.at("parameterRanges")) {
    job.parameter_ranges.push_back(ParameterRange{
      range_json.at("id").get<std::string>(),
      range_json.at("min").get<double>(),
      range_json.at("max").get<double>(),
      range_json.at("initial").get<double>(),
    });
  }

  const json& target_json = payload.at("target");
  job.target.category = target_json.at("category").get<std::string>();
  job.target.family = target_json.at("family").get<std::string>();
  for (auto it = target_json.at("values").begin(); it != target_json.at("values").end(); ++it) {
    job.target.values.emplace(it.key(), it.value().get<double>());
  }

  for (auto it = payload.at("metricWeights").begin(); it != payload.at("metricWeights").end(); ++it) {
    job.metric_weights.emplace(it.key(), it.value().get<double>());
  }

  return job;
}

json run_job(const JobInput& job) {
  if (job.parameter_ranges.empty()) {
    throw std::runtime_error("Optimizer job must include parameter ranges");
  }

  const int dimension = static_cast<int>(job.parameter_ranges.size());
  std::vector<double> lower_bounds(static_cast<std::size_t>(dimension));
  std::vector<double> upper_bounds(static_cast<std::size_t>(dimension));
  std::vector<double> x0(static_cast<std::size_t>(dimension));

  double average_span = 0.0;
  for (int i = 0; i < dimension; ++i) {
    const ParameterRange& range = job.parameter_ranges[static_cast<std::size_t>(i)];
    lower_bounds[static_cast<std::size_t>(i)] = range.min;
    upper_bounds[static_cast<std::size_t>(i)] = range.max;
    x0[static_cast<std::size_t>(i)] = range.initial;
    average_span += (range.max - range.min);
  }
  average_span /= static_cast<double>(dimension);
  const double sigma = std::max(0.05, average_span / 10.0);

  libcmaes::FitFunc objective = [&job](const double* x, const int n) {
    const auto params = vector_to_params(x, n, job.parameter_ranges);
    const json scored = score_candidate(job.architecture_id, params, job.target, job.metric_weights);
    const double normalized_score = scored.at("score").get<double>();
    return 1.0 - normalized_score;
  };

  libcmaes::GenoPheno<libcmaes::pwqBoundStrategy> gp(lower_bounds.data(), upper_bounds.data(), dimension);
  libcmaes::CMAParameters<libcmaes::GenoPheno<libcmaes::pwqBoundStrategy>> parameters(x0, sigma, -1, job.seed, gp);
  parameters.set_algo(aBIPOP_CMAES);
  parameters.set_quiet(true);
  parameters.set_mt_feval(false);
  parameters.set_max_fevals(job.max_evaluations);

  libcmaes::CMASolutions solutions = libcmaes::cmaes<libcmaes::GenoPheno<libcmaes::pwqBoundStrategy>>(objective, parameters);
  const libcmaes::Candidate& best = solutions.best_candidate();
  const dVec best_pheno = best.get_x_pheno_dvec(parameters);
  const auto best_params = vector_to_params(best_pheno.data(), dimension, job.parameter_ranges);
  json scored = score_candidate(job.architecture_id, best_params, job.target, job.metric_weights);

  json params_json = json::object();
  for (const auto& range : job.parameter_ranges) {
    params_json[range.id] = best_params.at(range.id);
  }

  json result = {
    {"winner", {
      {"architectureId", job.architecture_id},
      {"params", params_json},
      {"score", scored.at("score")},
      {"metrics", scored.at("metrics")},
    }},
    {"rejectedRegions", json::array()},
  };

  return result;
}

} // namespace

int main(int argc, char** argv) {
  try {
    if (argc > 2) {
      std::cerr << "usage: hayashi_optimizer [job.json]" << std::endl;
      return 2;
    }

    if (argc == 2) {
      std::ifstream file(argv[1]);
      if (!file) {
        throw std::runtime_error(std::string("Unable to open input file: ") + argv[1]);
      }
      std::cout << run_job(parse_input(file)).dump() << std::endl;
      return 0;
    }

    std::cout << run_job(parse_input(std::cin)).dump() << std::endl;
    return 0;
  } catch (const std::exception& error) {
    json failure = {
      {"error", error.what()},
    };
    std::cerr << failure.dump() << std::endl;
    return 1;
  }
}
