
####### Expanded from @PACKAGE_INIT@ by configure_package_config_file() #######
####### Any changes to this file will be overwritten by the next CMake run ####
####### The input file was libcmaes-config.cmake.in                            ########

get_filename_component(PACKAGE_PREFIX_DIR "${CMAKE_CURRENT_LIST_DIR}/../../../" ABSOLUTE)

macro(set_and_check _var _file)
  set(${_var} "${_file}")
  if(NOT EXISTS "${_file}")
    message(FATAL_ERROR "File or directory ${_file} referenced by variable ${_var} does not exist !")
  endif()
endmacro()

macro(check_required_components _NAME)
  foreach(comp ${${_NAME}_FIND_COMPONENTS})
    if(NOT ${_NAME}_${comp}_FOUND)
      if(${_NAME}_FIND_REQUIRED_${comp})
        set(${_NAME}_FOUND FALSE)
      endif()
    endif()
  endforeach()
endmacro()

####################################################################################

include(CMakeFindDependencyMacro)
list (APPEND CMAKE_MODULE_PATH /Users/jdbohrman/hayashi/native/optimizer/vendor/libcmaes/lib/cmake/libcmaes ${CMAKE_CURRENT_LIST_DIR})

find_dependency(Eigen3 REQUIRED)

set (_libcmaes_eigen_version "${Eigen3_VERSION}")
if (NOT _libcmaes_eigen_version AND DEFINED EIGEN3_VERSION_STRING)
  set (_libcmaes_eigen_version "${EIGEN3_VERSION_STRING}")
endif ()

if (NOT _libcmaes_eigen_version)
  message (FATAL_ERROR "Could not determine the Eigen version exposed by package Eigen3.")
endif ()

if (_libcmaes_eigen_version VERSION_LESS "3.4.0")
  message (
    FATAL_ERROR
      "libcmaes requires Eigen >= 3.4.0, but found ${_libcmaes_eigen_version}.")
endif ()


if(OFF)
    find_dependency(OpenMP )
endif()

include("${CMAKE_CURRENT_LIST_DIR}/libcmaesTargets.cmake")
check_required_components("libcmaes")
