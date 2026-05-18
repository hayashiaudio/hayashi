cmake_minimum_required(VERSION 3.20)

project(hayashi_optimizer LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(PREPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

set(LIBCMAES_BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(LIBCMAES_BUILD_PYTHON OFF CACHE BOOL "" FORCE)
set(LIBCMAES_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LIBCMAES_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LIBCMAES_USE_OPENMP OFF CACHE BOOL "" FORCE)
set(LIBCMAES_ENABLE_SURROG OFF CACHE BOOL "" FORCE)

find_package(Eigen3 REQUIRED)

add_subdirectory(vendor/libcmaes)

add_executable(hayashi_optimizer
  src/main.cpp
)

target_include_directories(hayashi_optimizer
  PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/vendor/json/include
)

target_link_libraries(hayashi_optimizer
  PRIVATE
    libcmaes::cmaes
    Eigen3::Eigen
)
