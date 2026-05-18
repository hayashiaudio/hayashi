set(EIGEN3_ROOT_DIR "${CMAKE_CURRENT_LIST_DIR}/../vendor/eigen")
get_filename_component(EIGEN3_ROOT_DIR "${EIGEN3_ROOT_DIR}" ABSOLUTE)

set(EIGEN3_INCLUDE_DIRS "${EIGEN3_ROOT_DIR}")

file(STRINGS "${EIGEN3_ROOT_DIR}/Eigen/Version" _eigen_version_world REGEX "#define EIGEN_WORLD_VERSION [0-9]+")
file(STRINGS "${EIGEN3_ROOT_DIR}/Eigen/Version" _eigen_version_major REGEX "#define EIGEN_MAJOR_VERSION [0-9]+")
file(STRINGS "${EIGEN3_ROOT_DIR}/Eigen/Version" _eigen_version_minor REGEX "#define EIGEN_MINOR_VERSION [0-9]+")

string(REGEX REPLACE ".*#define EIGEN_WORLD_VERSION ([0-9]+).*" "\\1" Eigen3_VERSION_MAJOR "${_eigen_version_world}")
string(REGEX REPLACE ".*#define EIGEN_MAJOR_VERSION ([0-9]+).*" "\\1" Eigen3_VERSION_MINOR "${_eigen_version_major}")
string(REGEX REPLACE ".*#define EIGEN_MINOR_VERSION ([0-9]+).*" "\\1" Eigen3_VERSION_PATCH "${_eigen_version_minor}")

set(Eigen3_VERSION "${Eigen3_VERSION_MAJOR}.${Eigen3_VERSION_MINOR}.${Eigen3_VERSION_PATCH}")
set(EIGEN3_VERSION_STRING "${Eigen3_VERSION}")

if(NOT TARGET Eigen3::Eigen)
  add_library(Eigen3::Eigen INTERFACE IMPORTED)
  set_target_properties(Eigen3::Eigen PROPERTIES
    INTERFACE_INCLUDE_DIRECTORIES "${EIGEN3_INCLUDE_DIRS}"
  )
endif()

include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(Eigen3
  REQUIRED_VARS EIGEN3_INCLUDE_DIRS
  VERSION_VAR Eigen3_VERSION
)
