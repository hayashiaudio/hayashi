/**
 * Standalone executable template for Hayashi plugin with Elements UI.
 *
 * This file is copied into the build directory and compiled alongside:
 *   - plugin_dsp.h    (Faust-generated DSP class)
 *   - plugin_ui.h/.cpp (Generated Elements UI)
 */

#include <elements.hpp>
#include <faust/dsp/dsp.h>
#include <faust/gui/UI.h>
#include <faust/gui/meta.h>
#include "HayashiDSP.h"
#include "plugin_ui.h"

using namespace cycfi::elements;

int main(int argc, char* argv[])
{
   app _app("Hayashi Plugin");
   window _win(_app.name());
   _win.on_close = [&_app]() { _app.stop(); };

   view view_(_win);

   HayashiPluginUi plugin_ui;
   plugin_ui.init(44100);

   view_.content(
      plugin_ui.make_ui()
   );

   _app.run();
   return 0;
}
