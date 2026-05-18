#----------------------------------------------------------------
# Generated CMake target import file.
#----------------------------------------------------------------

# Commands may need to know the format version.
set(CMAKE_IMPORT_FILE_VERSION 1)

# Import target "libcmaes::cmaes" for configuration ""
set_property(TARGET libcmaes::cmaes APPEND PROPERTY IMPORTED_CONFIGURATIONS NOCONFIG)
set_target_properties(libcmaes::cmaes PROPERTIES
  IMPORTED_LINK_INTERFACE_LANGUAGES_NOCONFIG "CXX"
  IMPORTED_LOCATION_NOCONFIG "${_IMPORT_PREFIX}/lib/libcmaes.a"
  )

list(APPEND _cmake_import_check_targets libcmaes::cmaes )
list(APPEND _cmake_import_check_files_for_libcmaes::cmaes "${_IMPORT_PREFIX}/lib/libcmaes.a" )

# Commands beyond this point should not need to know the version.
set(CMAKE_IMPORT_FILE_VERSION)
